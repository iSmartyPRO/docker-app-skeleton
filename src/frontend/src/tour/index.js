/*
 * Public API of guided tours (docs/extending.md → «Guided tours»).
 *
 *   registerTour({ id, module, version, route, title, steps })   add a tour
 *   hasTour(moduleId) / tourForModule(moduleId)                  is there one?
 *   startTour(idOrModuleId)                                      run it now (returns false when it cannot)
 *   useTour()                                                    the same inside React (+ progress, running)
 *   <TourButton module="tasks" />                                «Тур» button, only when a tour exists
 *   registerManifestTours(manifests)                             tours declared in module manifests (`tour` field)
 */
import { registerTour } from './engine';

export { registerTour, hasTour, tourForModule, getTour, listTours, planSteps } from './engine';
export { startTour, useTour, TourProvider } from './TourContext';
export { default as TourButton, TourIcon } from './TourButton';

/**
 * Registers the `tour` of every module manifest that declares one:
 * `tour: { steps, version?, route?, title? }` (the id and module default to the manifest id).
 * Returns a function that removes them again.
 */
export function registerManifestTours(manifests = []) {
  const undo = [];
  for (const manifest of manifests) {
    if (!manifest?.tour?.steps?.length) continue;
    undo.push(registerTour({ id: manifest.id, module: manifest.id, ...manifest.tour }));
  }
  return () => undo.forEach((fn) => fn());
}
