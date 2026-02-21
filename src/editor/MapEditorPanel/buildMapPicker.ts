/**
 * Map settings picker builder and sync.
 */
import {
  COMBAT_ATTACK_RANGE_MAX_PX,
  COMBAT_ATTACK_RANGE_MIN_PX,
  COMBAT_ATTACK_RANGE_PX,
  COMBAT_DAMAGE_VARIANCE_MAX_PCT,
  COMBAT_DAMAGE_VARIANCE_MIN_PCT,
  COMBAT_DAMAGE_VARIANCE_PCT,
  COMBAT_NPC_HIT_COOLDOWN_MAX_MS,
  COMBAT_NPC_HIT_COOLDOWN_MIN_MS,
  COMBAT_NPC_HIT_COOLDOWN_MS,
  COMBAT_PLAYER_ATTACK_COOLDOWN_MAX_MS,
  COMBAT_PLAYER_ATTACK_COOLDOWN_MIN_MS,
  COMBAT_PLAYER_ATTACK_COOLDOWN_MS,
} from "../../config/combat-config.ts";
import {
  EDITOR_INFO_PANEL_BG,
  EDITOR_INFO_PANEL_BORDER,
  EDITOR_MUTED_TEXT,
} from "../../constants/colors.ts";
import { EDITOR_INPUT_STYLE } from "./helpers.ts";

export interface MapPickerContext {
  game: {
    mapRenderer: {
      getMapData(): {
        name?: string;
        musicUrl?: string;
        weatherMode?: string;
        weatherIntensity?: string;
        weatherRainSfx?: boolean;
        weatherLightningEnabled?: boolean;
        weatherLightningChancePerSec?: number;
        combatEnabled?: boolean;
        combatSettings?: {
          attackRangePx?: number;
          playerAttackCooldownMs?: number;
          npcHitCooldownMs?: number;
          damageVariancePct?: number;
        };
        status?: string;
      } | null;
    };
  } | null;
  mapNameInput?: HTMLInputElement;
  mapMusicSelect?: HTMLSelectElement;
  mapWeatherSelect?: HTMLSelectElement;
  mapWeatherIntensitySelect?: HTMLSelectElement;
  mapWeatherSfxCheck?: HTMLInputElement;
  mapWeatherLightningCheck?: HTMLInputElement;
  mapWeatherLightningChanceInput?: HTMLInputElement;
  mapCombatCheck?: HTMLInputElement;
  mapCombatRangeInput?: HTMLInputElement;
  mapCombatCooldownInput?: HTMLInputElement;
  mapCombatNpcHitCooldownInput?: HTMLInputElement;
  mapCombatVarianceInput?: HTMLInputElement;
  mapStatusSelect?: HTMLSelectElement;
}

export function buildMapPicker(ctx: MapPickerContext): HTMLElement {
  const picker = document.createElement("div");
  picker.className = "tileset-picker";

  const header = document.createElement("div");
  header.className = "tileset-picker-header";
  const label = document.createElement("div");
  label.className = "tileset-picker-label";
  label.textContent = "Map Settings";
  header.appendChild(label);
  picker.appendChild(header);

  const form = document.createElement("div");
  form.style.cssText =
    "padding:8px;display:flex;flex-direction:column;gap:6px;font-size:12px;";

  const nameRow = document.createElement("div");
  nameRow.style.cssText = "display:flex;gap:4px;align-items:center;";
  const nameLabel = document.createElement("span");
  nameLabel.textContent = "Map Name:";
  nameLabel.style.minWidth = "80px";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Map name";
  nameInput.style.cssText = EDITOR_INPUT_STYLE;
  nameInput.addEventListener("input", () => {
    const mapData = ctx.game?.mapRenderer.getMapData();
    if (mapData) mapData.name = nameInput.value.trim() || mapData.name;
  });
  (ctx as { mapNameInput: HTMLInputElement }).mapNameInput = nameInput;
  nameRow.append(nameLabel, nameInput);
  form.appendChild(nameRow);

  const musicRow = document.createElement("div");
  musicRow.style.cssText = "display:flex;gap:4px;align-items:center;";
  const musicLabel = document.createElement("span");
  musicLabel.textContent = "Music:";
  musicLabel.style.minWidth = "80px";
  const musicSelect = document.createElement("select");
  musicSelect.style.cssText = EDITOR_INPUT_STYLE;
  musicSelect.addEventListener("change", () => {
    const mapData = ctx.game?.mapRenderer.getMapData();
    if (mapData) mapData.musicUrl = musicSelect.value || undefined;
  });
  (ctx as { mapMusicSelect: HTMLSelectElement }).mapMusicSelect = musicSelect;
  musicRow.append(musicLabel, musicSelect);
  form.appendChild(musicRow);

  const weatherRow = document.createElement("div");
  weatherRow.style.cssText = "display:flex;gap:4px;align-items:center;";
  const weatherLabel = document.createElement("span");
  weatherLabel.textContent = "Weather:";
  weatherLabel.style.minWidth = "80px";
  const weatherSelect = document.createElement("select");
  weatherSelect.style.cssText = EDITOR_INPUT_STYLE;
  for (const optDef of [
    { value: "clear", label: "Clear" },
    { value: "rainy", label: "Rainy" },
    { value: "scattered_rain", label: "Scattered rain" },
  ]) {
    const opt = document.createElement("option");
    opt.value = optDef.value;
    opt.textContent = optDef.label;
    weatherSelect.appendChild(opt);
  }
  weatherSelect.addEventListener("change", () => {
    const mapData = ctx.game?.mapRenderer.getMapData();
    if (mapData)
      mapData.weatherMode = weatherSelect.value as
        | "clear"
        | "rainy"
        | "scattered_rain";
  });
  (ctx as { mapWeatherSelect: HTMLSelectElement }).mapWeatherSelect =
    weatherSelect;
  weatherRow.append(weatherLabel, weatherSelect);
  form.appendChild(weatherRow);

  const weatherIntensityRow = document.createElement("div");
  weatherIntensityRow.style.cssText =
    "display:flex;gap:4px;align-items:center;";
  const weatherIntensityLabel = document.createElement("span");
  weatherIntensityLabel.textContent = "Rain Intensity:";
  weatherIntensityLabel.style.minWidth = "80px";
  const weatherIntensitySelect = document.createElement("select");
  weatherIntensitySelect.style.cssText = EDITOR_INPUT_STYLE;
  for (const optDef of [
    { value: "light", label: "Light" },
    { value: "medium", label: "Medium" },
    { value: "heavy", label: "Heavy" },
  ]) {
    const opt = document.createElement("option");
    opt.value = optDef.value;
    opt.textContent = optDef.label;
    weatherIntensitySelect.appendChild(opt);
  }
  weatherIntensitySelect.addEventListener("change", () => {
    const mapData = ctx.game?.mapRenderer.getMapData();
    if (mapData)
      mapData.weatherIntensity = weatherIntensitySelect.value as
        | "light"
        | "medium"
        | "heavy";
  });
  (ctx as { mapWeatherIntensitySelect: HTMLSelectElement })
    .mapWeatherIntensitySelect = weatherIntensitySelect;
  weatherIntensityRow.append(weatherIntensityLabel, weatherIntensitySelect);
  form.appendChild(weatherIntensityRow);

  const weatherSfxRow = document.createElement("div");
  weatherSfxRow.style.cssText = "display:flex;gap:4px;align-items:center;";
  const weatherSfxLabel = document.createElement("span");
  weatherSfxLabel.textContent = "Rain SFX:";
  weatherSfxLabel.style.minWidth = "80px";
  const weatherSfxCheck = document.createElement("input");
  weatherSfxCheck.type = "checkbox";
  weatherSfxCheck.addEventListener("change", () => {
    const mapData = ctx.game?.mapRenderer.getMapData();
    if (mapData) mapData.weatherRainSfx = weatherSfxCheck.checked;
  });
  (ctx as { mapWeatherSfxCheck: HTMLInputElement }).mapWeatherSfxCheck =
    weatherSfxCheck;
  weatherSfxRow.append(weatherSfxLabel, weatherSfxCheck);
  form.appendChild(weatherSfxRow);

  const weatherLightningRow = document.createElement("div");
  weatherLightningRow.style.cssText =
    "display:flex;gap:4px;align-items:center;";
  const weatherLightningLabel = document.createElement("span");
  weatherLightningLabel.textContent = "Lightning:";
  weatherLightningLabel.style.minWidth = "80px";
  const weatherLightningCheck = document.createElement("input");
  weatherLightningCheck.type = "checkbox";
  weatherLightningCheck.addEventListener("change", () => {
    const mapData = ctx.game?.mapRenderer.getMapData();
    if (mapData)
      mapData.weatherLightningEnabled = weatherLightningCheck.checked;
  });
  (ctx as { mapWeatherLightningCheck: HTMLInputElement })
    .mapWeatherLightningCheck = weatherLightningCheck;
  weatherLightningRow.append(weatherLightningLabel, weatherLightningCheck);
  form.appendChild(weatherLightningRow);

  const weatherLightningChanceRow = document.createElement("div");
  weatherLightningChanceRow.style.cssText =
    "display:flex;gap:4px;align-items:center;";
  const weatherLightningChanceLabel = document.createElement("span");
  weatherLightningChanceLabel.textContent = "Lightning/sec:";
  weatherLightningChanceLabel.style.minWidth = "80px";
  const weatherLightningChanceInput = document.createElement("input");
  weatherLightningChanceInput.type = "number";
  weatherLightningChanceInput.min = "0";
  weatherLightningChanceInput.max = "1";
  weatherLightningChanceInput.step = "0.01";
  weatherLightningChanceInput.style.cssText = EDITOR_INPUT_STYLE;
  weatherLightningChanceInput.addEventListener("input", () => {
    const mapData = ctx.game?.mapRenderer.getMapData();
    if (!mapData) return;
    const n = Number(weatherLightningChanceInput.value);
    if (!Number.isFinite(n)) return;
    mapData.weatherLightningChancePerSec = Math.max(0, Math.min(1, n));
  });
  (ctx as { mapWeatherLightningChanceInput: HTMLInputElement })
    .mapWeatherLightningChanceInput = weatherLightningChanceInput;
  weatherLightningChanceRow.append(
    weatherLightningChanceLabel,
    weatherLightningChanceInput,
  );
  form.appendChild(weatherLightningChanceRow);

  const combatRow = document.createElement("div");
  combatRow.style.cssText = "display:flex;gap:4px;align-items:center;";
  const combatLabel = document.createElement("span");
  combatLabel.textContent = "Combat:";
  combatLabel.style.minWidth = "80px";
  const combatCheck = document.createElement("input");
  combatCheck.type = "checkbox";
  combatCheck.addEventListener("change", () => {
    const mapData = ctx.game?.mapRenderer.getMapData();
    if (mapData) mapData.combatEnabled = combatCheck.checked;
  });
  (ctx as { mapCombatCheck: HTMLInputElement }).mapCombatCheck = combatCheck;
  combatRow.append(combatLabel, combatCheck);
  form.appendChild(combatRow);

  const combatRangeRow = document.createElement("div");
  combatRangeRow.style.cssText = "display:flex;gap:4px;align-items:center;";
  const combatRangeLabel = document.createElement("span");
  combatRangeLabel.textContent = "Attack Range:";
  combatRangeLabel.style.minWidth = "80px";
  const combatRangeInput = document.createElement("input");
  combatRangeInput.type = "number";
  combatRangeInput.min = String(COMBAT_ATTACK_RANGE_MIN_PX);
  combatRangeInput.max = String(COMBAT_ATTACK_RANGE_MAX_PX);
  combatRangeInput.step = "1";
  combatRangeInput.style.cssText = EDITOR_INPUT_STYLE;
  combatRangeInput.addEventListener("input", () => {
    const mapData = ctx.game?.mapRenderer.getMapData();
    if (!mapData) return;
    const n = Number(combatRangeInput.value);
    if (!Number.isFinite(n)) return;
    mapData.combatSettings = mapData.combatSettings ?? {};
    mapData.combatSettings.attackRangePx = Math.max(
      COMBAT_ATTACK_RANGE_MIN_PX,
      Math.min(COMBAT_ATTACK_RANGE_MAX_PX, Math.round(n)),
    );
  });
  (ctx as { mapCombatRangeInput: HTMLInputElement }).mapCombatRangeInput =
    combatRangeInput;
  combatRangeRow.append(combatRangeLabel, combatRangeInput);
  form.appendChild(combatRangeRow);

  const combatCooldownRow = document.createElement("div");
  combatCooldownRow.style.cssText =
    "display:flex;gap:4px;align-items:center;";
  const combatCooldownLabel = document.createElement("span");
  combatCooldownLabel.textContent = "Atk Cooldown:";
  combatCooldownLabel.style.minWidth = "80px";
  const combatCooldownInput = document.createElement("input");
  combatCooldownInput.type = "number";
  combatCooldownInput.min = String(COMBAT_PLAYER_ATTACK_COOLDOWN_MIN_MS);
  combatCooldownInput.max = String(COMBAT_PLAYER_ATTACK_COOLDOWN_MAX_MS);
  combatCooldownInput.step = "10";
  combatCooldownInput.style.cssText = EDITOR_INPUT_STYLE;
  combatCooldownInput.addEventListener("input", () => {
    const mapData = ctx.game?.mapRenderer.getMapData();
    if (!mapData) return;
    const n = Number(combatCooldownInput.value);
    if (!Number.isFinite(n)) return;
    mapData.combatSettings = mapData.combatSettings ?? {};
    mapData.combatSettings.playerAttackCooldownMs = Math.max(
      COMBAT_PLAYER_ATTACK_COOLDOWN_MIN_MS,
      Math.min(COMBAT_PLAYER_ATTACK_COOLDOWN_MAX_MS, Math.round(n)),
    );
  });
  (ctx as { mapCombatCooldownInput: HTMLInputElement }).mapCombatCooldownInput =
    combatCooldownInput;
  combatCooldownRow.append(combatCooldownLabel, combatCooldownInput);
  form.appendChild(combatCooldownRow);

  const combatNpcHitCdRow = document.createElement("div");
  combatNpcHitCdRow.style.cssText =
    "display:flex;gap:4px;align-items:center;";
  const combatNpcHitCdLabel = document.createElement("span");
  combatNpcHitCdLabel.textContent = "Hit Recovery:";
  combatNpcHitCdLabel.style.minWidth = "80px";
  const combatNpcHitCdInput = document.createElement("input");
  combatNpcHitCdInput.type = "number";
  combatNpcHitCdInput.min = String(COMBAT_NPC_HIT_COOLDOWN_MIN_MS);
  combatNpcHitCdInput.max = String(COMBAT_NPC_HIT_COOLDOWN_MAX_MS);
  combatNpcHitCdInput.step = "10";
  combatNpcHitCdInput.style.cssText = EDITOR_INPUT_STYLE;
  combatNpcHitCdInput.addEventListener("input", () => {
    const mapData = ctx.game?.mapRenderer.getMapData();
    if (!mapData) return;
    const n = Number(combatNpcHitCdInput.value);
    if (!Number.isFinite(n)) return;
    mapData.combatSettings = mapData.combatSettings ?? {};
    mapData.combatSettings.npcHitCooldownMs = Math.max(
      COMBAT_NPC_HIT_COOLDOWN_MIN_MS,
      Math.min(COMBAT_NPC_HIT_COOLDOWN_MAX_MS, Math.round(n)),
    );
  });
  (ctx as { mapCombatNpcHitCooldownInput: HTMLInputElement })
    .mapCombatNpcHitCooldownInput = combatNpcHitCdInput;
  combatNpcHitCdRow.append(combatNpcHitCdLabel, combatNpcHitCdInput);
  form.appendChild(combatNpcHitCdRow);

  const combatVarianceRow = document.createElement("div");
  combatVarianceRow.style.cssText =
    "display:flex;gap:4px;align-items:center;";
  const combatVarianceLabel = document.createElement("span");
  combatVarianceLabel.textContent = "Dmg Variance:";
  combatVarianceLabel.style.minWidth = "80px";
  const combatVarianceInput = document.createElement("input");
  combatVarianceInput.type = "number";
  combatVarianceInput.min = String(COMBAT_DAMAGE_VARIANCE_MIN_PCT);
  combatVarianceInput.max = String(COMBAT_DAMAGE_VARIANCE_MAX_PCT);
  combatVarianceInput.step = "1";
  combatVarianceInput.style.cssText = EDITOR_INPUT_STYLE;
  combatVarianceInput.addEventListener("input", () => {
    const mapData = ctx.game?.mapRenderer.getMapData();
    if (!mapData) return;
    const n = Number(combatVarianceInput.value);
    if (!Number.isFinite(n)) return;
    mapData.combatSettings = mapData.combatSettings ?? {};
    mapData.combatSettings.damageVariancePct = Math.max(
      COMBAT_DAMAGE_VARIANCE_MIN_PCT,
      Math.min(COMBAT_DAMAGE_VARIANCE_MAX_PCT, Math.round(n)),
    );
  });
  (ctx as { mapCombatVarianceInput: HTMLInputElement }).mapCombatVarianceInput =
    combatVarianceInput;
  combatVarianceRow.append(combatVarianceLabel, combatVarianceInput);
  form.appendChild(combatVarianceRow);

  const statusRow = document.createElement("div");
  statusRow.style.cssText = "display:flex;gap:4px;align-items:center;";
  const statusLabel = document.createElement("span");
  statusLabel.textContent = "Status:";
  statusLabel.style.minWidth = "80px";
  const statusSelect = document.createElement("select");
  statusSelect.style.cssText = EDITOR_INPUT_STYLE;
  for (const s of ["published", "draft"]) {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    statusSelect.appendChild(opt);
  }
  statusSelect.addEventListener("change", () => {
    const mapData = ctx.game?.mapRenderer.getMapData();
    if (mapData) mapData.status = statusSelect.value;
  });
  (ctx as { mapStatusSelect: HTMLSelectElement }).mapStatusSelect =
    statusSelect;
  statusRow.append(statusLabel, statusSelect);
  form.appendChild(statusRow);

  const info = document.createElement("div");
  info.style.cssText = `margin-top:6px;padding:6px 8px;background:${EDITOR_INFO_PANEL_BG};border:1px solid ${EDITOR_INFO_PANEL_BORDER};border-radius:4px;font-size:11px;color:${EDITOR_MUTED_TEXT};line-height:1.4;`;
  info.textContent = "Map settings are saved when you click Save.";
  form.appendChild(info);

  picker.appendChild(form);

  return picker;
}

export function syncMapSettingsUI(ctx: MapPickerContext): void {
  const mapData = ctx.game?.mapRenderer.getMapData();
  if (!mapData) return;
  if (ctx.mapNameInput) ctx.mapNameInput.value = mapData.name ?? "";
  if (ctx.mapMusicSelect) ctx.mapMusicSelect.value = mapData.musicUrl ?? "";
  if (ctx.mapWeatherSelect)
    ctx.mapWeatherSelect.value = mapData.weatherMode ?? "clear";
  if (ctx.mapWeatherIntensitySelect) {
    ctx.mapWeatherIntensitySelect.value =
      mapData.weatherIntensity ?? "medium";
  }
  if (ctx.mapWeatherSfxCheck) {
    ctx.mapWeatherSfxCheck.checked = !!mapData.weatherRainSfx;
  }
  if (ctx.mapWeatherLightningCheck) {
    ctx.mapWeatherLightningCheck.checked = !!mapData.weatherLightningEnabled;
  }
  if (ctx.mapWeatherLightningChanceInput) {
    ctx.mapWeatherLightningChanceInput.value = String(
      mapData.weatherLightningChancePerSec ?? 0.03,
    );
  }
  if (ctx.mapCombatCheck)
    ctx.mapCombatCheck.checked = mapData.combatEnabled ?? false;
  if (ctx.mapCombatRangeInput) {
    ctx.mapCombatRangeInput.value = String(
      mapData.combatSettings?.attackRangePx ?? COMBAT_ATTACK_RANGE_PX,
    );
  }
  if (ctx.mapCombatCooldownInput) {
    ctx.mapCombatCooldownInput.value = String(
      mapData.combatSettings?.playerAttackCooldownMs ??
        COMBAT_PLAYER_ATTACK_COOLDOWN_MS,
    );
  }
  if (ctx.mapCombatNpcHitCooldownInput) {
    ctx.mapCombatNpcHitCooldownInput.value = String(
      mapData.combatSettings?.npcHitCooldownMs ?? COMBAT_NPC_HIT_COOLDOWN_MS,
    );
  }
  if (ctx.mapCombatVarianceInput) {
    ctx.mapCombatVarianceInput.value = String(
      mapData.combatSettings?.damageVariancePct ?? COMBAT_DAMAGE_VARIANCE_PCT,
    );
  }
  if (ctx.mapStatusSelect)
    ctx.mapStatusSelect.value = mapData.status ?? "published";
}
