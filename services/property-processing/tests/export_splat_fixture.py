"""Authored Gaussian test data; never a trained/reconstructed scene claim."""
import math
from pathlib import Path
import struct
import sys
from property_processing.splat_export import export_private_tiers, SH_C0

root = Path(sys.argv[1])
source = root / 'authored.ply'
names = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3']
rows = []
for x in (-1, 0, 1):
    for y in (-1, 0, 1):
        for z in (-1, 0, 1):
            colours = [(x + 2) / 4, (y + 2) / 4, (z + 2) / 4]
            rows.append([x, y, z, *((value - .5) / SH_C0 for value in colours), math.log(3), math.log(.22), math.log(.13), math.log(.08), math.sqrt(.5), 0, 0, math.sqrt(.5)])
header = 'ply\nformat binary_little_endian 1.0\nelement vertex 27\n' + ''.join('property float ' + name + '\n' for name in names) + 'end_header\n'
source.write_bytes(header.encode() + b''.join(struct.pack('<14f', *row) for row in rows))
export_private_tiers(source, root / 'package')
print('Exported 27 authored Gaussian splats; not GPU training evidence.')
