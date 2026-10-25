import fengari from 'fengari';
/** Compile only: diagnostics must never run a project's source in the editor. */
export function luaSyntaxError(source, name = 'Script') {
  const { lua, lauxlib, to_luastring } = fengari,
    L = lauxlib.luaL_newstate();
  try {
    const status = lauxlib.luaL_loadbuffer(L, to_luastring(source), null, to_luastring('@' + name));
    if (status === lua.LUA_OK) return null;
    const message = lua.lua_tojsstring(L, -1);
    return { line: Number(message.match(/:(\d+):/)?.[1] || 1), message };
  } finally {
    lua.lua_close(L);
  }
}
