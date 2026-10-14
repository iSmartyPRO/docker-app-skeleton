/** Codes printed by the module on its own labels: WI-<item>, WB-<bin>, WT-<instance>, WW-<warehouse> (as on the server). */
export function parseOwnCode(code) {
  const match = /^W([IBTW])-(\d{1,9})$/i.exec(String(code || '').trim());
  if (!match) return null;
  return { kind: { I: 'item', B: 'bin', T: 'instance', W: 'warehouse' }[match[1].toUpperCase()], id: Number(match[2]) };
}
