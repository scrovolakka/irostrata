export function normalizePresetState(preset, defaultCustom, fallbackSettings) {
  const sourcePlates = Array.isArray(preset?.plates) ? preset.plates.slice(0, 6) : [];
  const plates = sourcePlates.map((plate, index) => ({ id: index + 1, inkId: plate.inkId || "black" }));
  const sourceCustom = preset?.settings?.customByPlate ?? {};
  const customByPlate = Object.fromEntries(plates.map((plate, index) => [
    plate.id,
    { ...defaultCustom, ...(sourceCustom[sourcePlates[index].id] ?? {}) },
  ]));
  return {
    plates,
    settings: { ...fallbackSettings, ...preset.settings, customByPlate },
  };
}
