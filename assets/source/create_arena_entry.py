import bpy
import math
from mathutils import Vector
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
OUTPUT_GLB = ROOT / 'assets' / 'models' / 'arena_entry.glb'
OUTPUT_BLEND = ROOT / 'assets' / 'source' / 'arena_entry.blend'

# Reset to a clean, editable Blender scene.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for datablocks in (bpy.data.materials, bpy.data.curves, bpy.data.meshes):
    for datablock in list(datablocks):
        if datablock.users == 0:
            datablocks.remove(datablock)


def material(name, color, metallic=0.4, roughness=0.35, emission=None, strength=1.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    if emission:
        socket = shader.inputs.get('Emission Color') or shader.inputs.get('Emission')
        if socket:
            socket.default_value = (*emission, 1)
        power = shader.inputs.get('Emission Strength')
        if power:
            power.default_value = strength
    return mat


carbon = material('Entry | carbon armor', (0.018, 0.027, 0.04), 0.7)
steel = material('Entry | brushed titanium', (0.12, 0.17, 0.22), 0.82)
blue = material('Entry | cyan guide lights', (0.01, 0.35, 0.55), 0.25, 0.28, (0.0, 0.55, 1.0), 3.0)
amber = material('Entry | amber status lights', (0.55, 0.19, 0.015), 0.2, 0.3, (1.0, 0.24, 0.015), 2.4)
screen = material('Entry | display glass', (0.005, 0.045, 0.07), 0.25, 0.2, (0.0, 0.25, 0.42), 1.5)
white = material('Entry | lettering', (0.72, 0.9, 1.0), 0.1, 0.3, (0.42, 0.8, 1.0), 1.4)


def cube(name, location, dimensions, mat, bevel=0.08):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    ob = bpy.context.object
    ob.name = name
    ob.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if mat:
        ob.data.materials.append(mat)
    if bevel:
        mod = ob.modifiers.new('Soft machined edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return ob


def label(body, location, size, mat, rotation):
    curve = bpy.data.curves.new(body, 'FONT')
    curve.body = body
    curve.size = size
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    curve.extrude = 0.006
    ob = bpy.data.objects.new(body, curve)
    bpy.context.collection.objects.link(ob)
    ob.location = location
    ob.rotation_euler = rotation
    curve.materials.append(mat)
    return ob


# Low, broad landing pad. Blender Y maps to the scene's front/back direction.
cube('Entry platform foundation', (0, 0, 0.13), (13.4, 9.0, 0.26), carbon, 0.18)
cube('Entry platform inset', (0, 0, 0.285), (11.9, 7.7, 0.08), steel, 0.08)
cube('Entry center walkway', (0, 0.0, 0.34), (5.6, 7.0, 0.035), carbon, 0.02)

# Cyan lines guide arrivals through the gate and toward the selection terminal.
for x in (-5.35, 5.35):
    cube('Walkway edge light', (x, 0, 0.34), (0.12, 7.5, 0.06), blue, 0.025)
for y in (-2.8, -1.2, 0.4, 2.0, 3.3):
    for x in (-2.65, 2.65):
        cube('Floor direction marker', (x, y, 0.37), (0.55, 0.11, 0.035), blue, 0.025)

# Open welcome arch with reinforced feet and a broad title beam.
for x in (-5.0, 5.0):
    cube('Gate pylon foot', (x, -1.4, 0.58), (1.15, 1.15, 0.55), steel, 0.14)
    cube('Gate pylon', (x, -1.4, 2.55), (0.72, 0.78, 3.6), carbon, 0.12)
    cube('Pylon front light', (x, -1.82, 2.55), (0.12, 0.08, 2.9), blue, 0.035)
    cube('Pylon amber marker', (x, -1.82, 0.9), (0.3, 0.08, 0.12), amber, 0.025)
cube('Welcome arch header', (0, -1.4, 4.28), (10.75, 0.9, 0.68), steel, 0.13)
cube('Welcome sign inset', (0, -1.88, 4.25), (8.6, 0.08, 0.43), screen, 0.06)

# Text faces arrivals outside the arena (Blender +Y is scene -Z).
label('ARENA ENTRY', (0, -1.94, 4.26), 0.34, white, (math.radians(90), 0, 0))
label('TOY ROBOT WORLDS', (0, 3.65, 4.05), 0.28, white, (math.radians(-90), 0, 0))

# Central interactive terminal shell. Its touch/click collider stays in SDK code.
cube('Terminal pedestal', (0, 1.2, 0.72), (2.7, 1.55, 0.72), carbon, 0.16)
cube('Terminal silver belt', (0, 1.2, 0.9), (2.76, 1.58, 0.14), steel, 0.035)
cube('Terminal console body', (0, 1.0, 1.45), (2.28, 1.2, 0.95), carbon, 0.14)
cube('Terminal screen', (0, 0.37, 1.8), (1.68, 0.08, 0.63), screen, 0.09)
cube('Terminal status light left', (-0.88, 0.31, 1.8), (0.1, 0.06, 0.42), blue, 0.025)
cube('Terminal status light right', (0.88, 0.31, 1.8), (0.1, 0.06, 0.42), amber, 0.025)
label('SELECT MECH', (0, 0.30, 1.82), 0.19, white, (math.radians(90), 0, 0))

# Small side pylons make the spawn zone feel framed without closing the path.
for x in (-6.0, 6.0):
    cube('Entry beacon base', (x, 3.25, 0.65), (0.8, 0.8, 0.82), steel, 0.1)
    cube('Entry beacon lens', (x, 3.25, 1.35), (0.42, 0.42, 0.7), blue, 0.08)

# Save the editable Blender project, then export the visible geometry as a GLB.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_BLEND))
bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT_GLB),
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_cameras=False,
    export_lights=False
)
print(f'Created {OUTPUT_BLEND} and {OUTPUT_GLB}')
