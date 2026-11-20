"""Build the clean Cyber Battle Zone arena without stadium or team displays."""

import bpy
from pathlib import Path
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
OUTPUT_GLB = ROOT / 'assets' / 'models' / 'cyber_battle_zone.glb'
OUTPUT_BLEND = ROOT / 'assets' / 'source' / 'cyber_battle_zone.blend'


# Start with a clean Blender file so running this script is repeatable.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for datablocks in (bpy.data.materials, bpy.data.curves, bpy.data.meshes):
    for datablock in list(datablocks):
        if datablock.users == 0:
            datablocks.remove(datablock)


def material(name, color, metallic=0.0, roughness=0.45, emission=None, strength=1.0):
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


steel = material('Gunmetal | structural steel', (0.055, 0.075, 0.095), 0.8, 0.3)
steel2 = material('Titanium | panel edges', (0.19, 0.23, 0.27), 0.75, 0.28)
black = material('Carbon black', (0.012, 0.018, 0.026), 0.45, 0.35)
floor_mat = material('Arena floor | dark graphite', (0.035, 0.045, 0.06), 0.55, 0.42)
white = material('Cool white lettering', (0.82, 0.9, 1.0), 0.2, 0.3, (0.55, 0.72, 1.0), 0.5)
red = material('Cyber Battle Zone red', (1.0, 0.015, 0.035), 0.25, 0.25, (1.0, 0.005, 0.02), 4.0)


def cube(name, location, dimensions, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    ob = bpy.context.object
    ob.name = name
    ob.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if mat:
        ob.data.materials.append(mat)
    if bevel:
        mod = ob.modifiers.new('Machined bevels', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return ob


def text_obj(body, location, size, mat):
    curve = bpy.data.curves.new(body, 'FONT')
    curve.body = body
    curve.size = size
    curve.extrude = 0.012
    curve.bevel_depth = 0.002
    curve.align_x = 'CENTER'
    ob = bpy.data.objects.new(body, curve)
    bpy.context.collection.objects.link(ob)
    ob.location = location
    curve.materials.append(mat)
    return ob


# Structural platform and the unobstructed combat deck.
cube('Foundation slab', (0, 0, -0.8), (42, 34, 1.2), black, 0.35)
cube('Arena deck', (0, 0, -0.12), (39, 31, 0.28), steel, 0.18)
cube('Combat floor', (0, -1, 0.06), (32, 22, 0.18), floor_mat, 0.18)

# Subtle floor seams frame the open battle space.
for x in range(-15, 16, 3):
    cube('Floor expansion seam', (x, -1, 0.16), (0.035, 21.5, 0.012), steel2, 0.005)
for y in range(-11, 10, 3):
    cube('Floor expansion seam', (0, y, 0.16), (31.5, 0.035, 0.012), steel2, 0.005)

# Keep the central Cyber Battle Zone identity, without team branding.
cube('Central logo plate', (0, -1, 0.19), (10, 5.2, 0.06), black, 0.22)
cube('Logo frame front', (0, -3.7, 0.24), (10, 0.12, 0.05), red, 0.006)
cube('Logo frame rear', (0, 1.7, 0.24), (10, 0.12, 0.05), red, 0.006)
cube('Logo frame left', (-5, -1, 0.24), (0.12, 5.3, 0.05), red, 0.006)
cube('Logo frame right', (5, -1, 0.24), (0.12, 5.3, 0.05), red, 0.006)
text_obj('CYBER', (0, -0.5, 0.27), 1.25, white)
text_obj('BATTLE ZONE', (0, -1.75, 0.27), 0.95, red)

# Plain perimeter barriers keep the combat area legible without stands,
# crowd figures, team colors, screens, or deployment scenery.
for x in range(-17, 18, 2):
    cube('Front arena barrier', (x, -13.5, 0.8), (1.85, 0.75, 1.35), steel, 0.12)
for y in range(-12, 12, 2):
    cube('Left arena barrier', (-17.5, y, 0.8), (0.75, 1.85, 1.35), steel, 0.12)
    cube('Right arena barrier', (17.5, y, 0.8), (0.75, 1.85, 1.35), steel, 0.12)

# Keep a useful default view when opening the editable Blender project.
bpy.ops.object.camera_add(location=(42, -58, 34))
camera = bpy.context.object
camera.name = 'Arena overview camera'
camera.rotation_euler = (Vector((0, 0, 2)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
bpy.context.scene.camera = camera

bpy.ops.object.select_all(action='SELECT')
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_BLEND))

# Merge visible geometry into one optimized static mesh for the scene GLB.
bpy.ops.object.select_all(action='DESELECT')
for ob in bpy.context.scene.objects:
    if ob.type == 'FONT':
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.convert(target='MESH')

mesh_objects = [ob for ob in bpy.context.scene.objects if ob.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for ob in mesh_objects:
    ob.select_set(True)
bpy.context.view_layer.objects.active = mesh_objects[0]
bpy.ops.object.join()
bpy.context.view_layer.objects.active.name = 'Cyber Battle Zone Arena'

bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT_GLB),
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_cameras=False,
    export_lights=False
)
print(f'Created clean arena: {OUTPUT_BLEND} and {OUTPUT_GLB}')
