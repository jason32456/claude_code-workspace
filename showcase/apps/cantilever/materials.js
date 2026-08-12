// Material properties shared by the editor, the solver and the renderer.
//
// One grid cell is 1 m. `density` is kg/m, `ea` is axial stiffness in newtons
// (a member carrying force F stretches by F/EA), `strength` is the axial force
// it survives, and `buckleLength` is the length past which compression capacity
// starts falling off as 1/L² — the stand-in for Euler buckling.

export const MATERIALS = {
  road: {
    id: 'road',
    name: 'Road',
    key: '1',
    cost: 12,
    density: 34,
    ea: 9.0e5,
    strength: 17000,
    buckleLength: 2.4,
    tensionOnly: false,
    drivable: true,
    maxLength: 4.05,
    color: '#e2e8f0',
    width: 6,
  },
  beam: {
    id: 'beam',
    name: 'Beam',
    key: '2',
    cost: 8,
    density: 14,
    ea: 7.0e5,
    strength: 20000,
    buckleLength: 2.0,
    tensionOnly: false,
    drivable: false,
    maxLength: 4.05,
    color: '#5eead4',
    width: 3.4,
  },
  cable: {
    id: 'cable',
    name: 'Cable',
    key: '3',
    cost: 3,
    density: 4,
    ea: 3.0e5,
    strength: 15000,
    buckleLength: Infinity,
    tensionOnly: true,
    drivable: false,
    maxLength: 7.6,
    color: '#fbbf24',
    width: 1.7,
  },
};

export const MATERIAL_LIST = [MATERIALS.road, MATERIALS.beam, MATERIALS.cable];

// Longest member the editor will place. Short beams force real trusses instead
// of one plank across the gap; cables get a longer reach because spanning is the
// whole point of a stay.
export const MAX_MEMBER_LENGTH = Math.max(...Object.values(MATERIALS).map((m) => m.maxLength));

export function maxLengthOf(materialId) {
  return MATERIALS[materialId].maxLength;
}

export function memberCost(materialId, length) {
  return Math.round(MATERIALS[materialId].cost * length);
}

// Compression capacity falls off with length; tension capacity does not. Real
// buckling goes as 1/L², which is punishing enough to make every truss
// impossible here, so the falloff is linear past the material's buckle length.
export function capacity(material, length, compression) {
  if (!compression) return material.strength;
  const slender = material.buckleLength / length;
  return material.strength * Math.max(0.25, Math.min(1, slender));
}
