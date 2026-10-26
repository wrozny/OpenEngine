import fengari from 'fengari';
import interop from 'fengari-interop';
import { SceneNode, isRunnableScript } from './scene.js';
import { Vector2, Vector3 } from './math.js';
import { Signal } from './signal.js';

const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
const BOOTSTRAP = `
local host = __host
__host = nil
typeof = function(value) return host:TypeOf(value) end
Vector2 = { new = function(x, y) return host:Vector(x or 0, y or 0) end }
Vector3 = { new = function(x, y, z) return host:Vector3(x or 0, y or 0, z or 0) end }
Instance = { new = function(className, parent) return host:Create(className, parent) end }
print = function(...)
  local parts = {}
  for i = 1, select('#', ...) do parts[i] = tostring(select(i, ...)) end
  host:Print(table.concat(parts, '  '))
end
warn = function(message) host:Warn(tostring(message)) end
local cache, loading = {}, {}
function require(module)
  assert(module and module.ClassName == 'ModuleScript', 'require expects a ModuleScript instance')
  if cache[module] ~= nil then return cache[module] end
  assert(not loading[module], 'Circular module dependency: ' .. module.Name)
  loading[module] = true
  local env = setmetatable({script = module}, {__index = _G})
  local chunk, message = load(module.Source, '@' .. module:GetFullName(), 't', env)
  if not chunk then loading[module] = nil; error(message) end
  local ok, result = pcall(chunk)
  loading[module] = nil
  if not ok then error(result) end
  assert(result ~= nil, 'ModuleScript must return a value: ' .. module.Name)
  cache[module] = result
  return result
end
function __runScript(node)
  local env = setmetatable({script = node}, {__index = _G})
  local chunk, message = load(node.Source, '@' .. node:GetFullName(), 't', env)
  assert(chunk, message)
  return chunk()
end
-- Projects are trusted code, but filesystem/process APIs are intentionally not part of the engine API.
io, os, debug, dofile, loadfile, package = nil, nil, nil, nil, nil, nil
`;

/** One Lua state per play session; modules are cached only inside that session. */
export class LuaRuntime {
  constructor(engine) {
    this.engine = engine;
    this.proxies = new WeakMap();
    this.targets = new WeakMap();
    this.connections = new Set();
    this.currentScript = null;
    this.state = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(this.state);
    lauxlib.luaL_requiref(this.state, to_luastring('js'), interop.luaopen_js, 0);
    lua.lua_pop(this.state, 1);
    this.setGlobal('__host', {
      TypeOf: (value) => {
        value = this.unwrap(value);
        return value instanceof Vector3
          ? 'Vector3'
          : value instanceof Vector2
            ? 'Vector2'
            : value instanceof SceneNode
              ? 'Instance'
              : typeof value;
      },
      Vector: (x, y) => new Vector2(x, y),
      Vector3: (x, y, z) => new Vector3(x, y, z),
      Create: (className, parent) => {
        const node = new SceneNode(className);
        if (parent) node.Parent = parent;
        return node;
      },
      Print: (text) => engine.log('info', text),
      Warn: (text) => engine.log('warning', text),
    });
    this.setGlobal('game', engine.game);
    this.setGlobal('workspace', engine.workspace);
    this.evaluate(BOOTSTRAP, 'engine/bootstrap');
    lua.lua_getglobal(this.state, to_luastring('__runScript'));
    this.runScript = interop.tojs(this.state, -1);
    lua.lua_pop(this.state, 1);
  }
  unwrap(value) {
    return value && (this.targets.get(value) || value);
  }
  attributeValue(value, depth = 0) {
    value = this.unwrap(value);
    if (depth > 50) throw new Error('Attribute table is too deeply nested or cyclic');
    if (typeof value === 'function' && value.get && value[Symbol.iterator]) {
      let entries;
      try {
        entries = [...value];
      } catch {
        return value;
      }
      const result = Object.create(null);
      for (const [key, item] of entries) result[key] = this.attributeValue(item, depth + 1);
      const keys = Object.keys(result);
      return keys.length && keys.every((key, i) => Number(key) === i + 1)
        ? keys.map((key) => result[key])
        : result;
    }
    return value;
  }
  wrap(value) {
    if (value == null) return undefined;
    if (typeof value !== 'object') return value;
    if (this.proxies.has(value)) return this.proxies.get(value);
    const runtime = this;
    const proxy = new Proxy(value, {
      get(target, key) {
        if (
          typeof key === 'string' &&
          ((key.startsWith('_') && (target instanceof SceneNode || target instanceof Signal)) ||
            key === 'constructor' ||
            key === '__proto__')
        )
          return undefined;
        if (Array.isArray(target) && /^\d+$/.test(String(key)))
          return runtime.wrap(target[Number(key) - 1]);
        let result = Reflect.get(target, key, target);
        if (result === undefined && target instanceof SceneNode)
          result = target.FindFirstChild(key);
        if (typeof result !== 'function') return runtime.wrap(result);
        if (result.invoke && result.get) return result;
        return function (...args) {
          if (target instanceof Signal && key === 'Connect') {
            const callback = args[0];
            const owner = runtime.currentScript;
            let connection;
            connection = target.Connect((...eventArgs) => {
              const previous = runtime.currentScript;
              runtime.currentScript = owner;
              try {
                runtime.call(callback, eventArgs);
              } catch (error) {
                connection.Disconnect();
                runtime.engine.log(
                  'error',
                  `Event handler stopped (${owner?.GetFullName() || 'script'}): ${runtime.errorText(error)}`,
                );
              } finally {
                runtime.currentScript = previous;
              }
            });
            connection._owner = owner;
            connection._onDisconnect = () => runtime.connections.delete(connection);
            runtime.connections.add(connection);
            return runtime.wrap(connection);
          }
          if (target instanceof SceneNode && key === 'SetAttribute') {
            target.SetAttribute(args[0], runtime.attributeValue(args[1]));
            return;
          }
          if (
            target instanceof SceneNode &&
            ['FireServer', 'FireClient', 'FireAllClients'].includes(key)
          )
            args = args.map((arg) => runtime.attributeValue(arg));
          return runtime.wrap(
            result.apply(
              target,
              args.map((arg) => runtime.unwrap(arg)),
            ),
          );
        };
      },
      deleteProperty(target, key) {
        if (key === 'Follow' && target === runtime.engine.camera) {
          target.Follow = null;
          return true;
        }
        if (key === 'Parent') {
          target.Parent = null;
          return true;
        }
        throw new Error('Only Parent can be assigned nil; use Destroy to remove an instance');
      },
      set(target, key, value) {
        if (
          typeof key !== 'string' ||
          key.startsWith('_') ||
          ['Id', 'ClassName', 'Destroyed', 'constructor', '__proto__'].includes(key)
        )
          throw new Error(`Read-only property: ${String(key)}`);
        const previousValue = target[key];
        Reflect.set(target, key, runtime.unwrap(value), target);
        if (
          target instanceof SceneNode &&
          isRunnableScript(target) &&
          key === 'Enabled' &&
          previousValue !== target.Enabled &&
          target._engine?.running
        ) {
          runtime.stopScript(target);
          if (target.Enabled && runtime.engine.shouldRun(target)) runtime.run(target);
        }
        if (
          target._body &&
          [
            'Size',
            'Shape',
            'Anchored',
            'Sensor',
            'CollisionGroup',
            'Restitution',
            'Friction',
            'Mass',
            'FixedRotation',
          ].includes(key)
        )
          runtime.engine.rebuildBody(target);

        return true;
      },
    });
    this.proxies.set(value, proxy);
    this.targets.set(proxy, value);
    return proxy;
  }
  setGlobal(name, value) {
    interop.push(this.state, this.wrap(value));
    lua.lua_setglobal(this.state, to_luastring(name));
  }
  armBudget() {
    lua.lua_sethook(
      this.state,
      (state) => {
        lauxlib.luaL_error(
          state,
          to_luastring(
            'Lua instruction limit exceeded (200,000 per callback). Split work across Heartbeat frames.',
          ),
        );
      },
      lua.LUA_MASKCOUNT,
      200000,
    );
  }
  call(callback, args = []) {
    this.armBudget();
    try {
      const wrapped = args.map((value) => this.wrap(value));
      return callback.apply(wrapped[0], wrapped.slice(1));
    } finally {
      lua.lua_sethook(this.state, null, 0, 0);
    }
  }
  evaluate(source, name) {
    const L = this.state;
    const top = lua.lua_gettop(L);
    this.armBudget();
    try {
      let status = lauxlib.luaL_loadbuffer(L, to_luastring(source), null, to_luastring(`@${name}`));
      if (status === lua.LUA_OK) status = lua.lua_pcall(L, 0, 0, 0);
      if (status !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(L, -1));
    } finally {
      lua.lua_settop(L, top);
      lua.lua_sethook(L, null, 0, 0);
    }
  }
  stopScript(node) {
    for (const connection of this.connections)
      if (connection._owner === node) {
        connection.Disconnect();
        this.connections.delete(connection);
      }
  }
  run(node) {
    const previous = this.currentScript;
    this.currentScript = node;
    try {
      this.call(this.runScript, [node]);
    } catch (error) {
      this.stopScript(node);
      this.engine.log('error', `${node.GetFullName()}: ${this.errorText(error)}`);
    } finally {
      this.currentScript = previous;
    }
  }
  errorText(error) {
    if (error instanceof Error) return error.message;
    if (error instanceof Uint8Array) return to_jsstring(error);
    return String(error);
  }
  dispose() {
    for (const connection of this.connections) connection.Disconnect();
    this.connections.clear();
    lua.lua_close(this.state);
  }
}
