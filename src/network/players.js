import { Signal } from '../engine/signal.js';

export class Player {
  constructor(id, name, onError) {
    this.UserId = id;
    this.Name = name;
    this.Character = null;
    this.CharacterAdded = new Signal(onError);
  }
  SetCharacter(character) {
    this.Character = character;
    if (character) this.CharacterAdded.Fire(character);
  }
}
export class PlayersService {
  constructor(onError) {
    this._players = new Map();
    this.LocalPlayer = null;
    this.PlayerAdded = new Signal(onError);
    this.PlayerRemoving = new Signal(onError);
    this.OnPlayerAdded = this.PlayerAdded;
    this.OnPlayerRemoving = this.PlayerRemoving;
  }
  GetPlayers() {
    return [...this._players.values()];
  }
  GetPlayerByUserId(id) {
    return this._players.get(id);
  }
  GetPlayerFromCharacter(character) {
    return this.GetPlayers().find((player) => player.Character === character);
  }
  add(player) {
    this._players.set(player.UserId, player);
    this.PlayerAdded.Fire(player);
  }
  remove(player) {
    this.PlayerRemoving.Fire(player);
    this._players.delete(player.UserId);
  }
  dispose() {
    this.PlayerAdded.Clear();
    this.PlayerRemoving.Clear();
    for (const player of this.GetPlayers()) player.CharacterAdded.Clear();
    this._players.clear();
  }
}
