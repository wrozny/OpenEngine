-- ModuleScripts run once per play session and return a reusable value.
return {
    ZombieTexture = game:GetService("AssetService"):Get("zombie"),
    ArenaWidth = 1800,
    ArenaHeight = 1200,
    StartingHealth = 100,
    StartingDamage = 30,
    StartingFireRate = 4,
    StartingSpeed = 240,
    KillReward = 25,
    UpgradeBaseCost = 50,
}
