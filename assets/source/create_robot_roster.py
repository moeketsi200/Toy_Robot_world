import bpy
import math
from pathlib import Path
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = ROOT / 'assets' / 'models'
SOURCE_DIR = ROOT / 'assets' / 'source'


def material(name, color, metallic=0.35, roughness=0.34, emission=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1.0)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    emission_color = shader.inputs.get('Emission Color') or shader.inputs.get('Emission')
    if emission_color:
        emission_color.default_value = (*color, 1.0)
    emission_strength = shader.inputs.get('Emission Strength')
    if emission_strength:
        emission_strength.default_value = emission
    return mat


SLATE = material('Graphite armor', (0.055, 0.085, 0.12), 0.72, 0.28)
BLACK = material('Joint rubber and dark steel', (0.018, 0.025, 0.034), 0.4, 0.48)
STEEL = material('Brushed titanium', (0.31, 0.39, 0.44), 0.82, 0.24)
CYAN = material('Ion cyan light', (0.015, 0.73, 0.95), 0.25, 0.2, 2.0)
AMBER = material('Warning amber', (1.0, 0.24, 0.025), 0.3, 0.25, 1.2)
RED = material('Ravager crimson', (0.58, 0.035, 0.055), 0.55, 0.27)
BLUE = material('Vectra cobalt', (0.035, 0.16, 0.52), 0.62, 0.28)
WHITE = material('Protector ceramic', (0.68, 0.76, 0.78), 0.35, 0.3)
PURPLE = material('Reaper violet', (0.22, 0.07, 0.35), 0.62, 0.3)
YELLOW = material('Blitzer flight yellow', (0.95, 0.48, 0.025), 0.48, 0.28)
OLIVE = material('Dominator siege olive', (0.27, 0.31, 0.16), 0.72, 0.32)


def finish(obj, name, mat, bevel=0.0):
    obj.name = name
    if mat:
        obj.data.materials.append(mat)
    if bevel and obj.type == 'MESH':
        modifier = obj.modifiers.new('Machined softened edges', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 2
    return obj


def box(name, loc, dims, mat, bevel=0.08, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if rot:
        obj.rotation_euler = rot
    return finish(obj, name, mat, bevel)


def sphere(name, loc, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, location=loc)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat)


def cylinder(name, loc, radius, depth, mat, vertices=16, rot=None, radius2=None):
    if radius2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=radius2, depth=depth, location=loc)
    obj = bpy.context.object
    if rot:
        obj.rotation_euler = rot
    return finish(obj, name, mat, 0.025)


def beam(name, start, end, radius, mat, vertices=10):
    a, b = Vector(start), Vector(end)
    direction = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=direction.length, location=(a + b) / 2)
    obj = bpy.context.object
    obj.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()
    return finish(obj, name, mat, 0.015)


def wheel(name, loc, radius, width, mat):
    return cylinder(name, loc, radius, width, mat, 16, (0, math.pi / 2, 0))


def eye_pair(z, mat=CYAN, x=0.18, y=-0.56):
    for side in (-1, 1):
        sphere('Optical sensor', (side * x, y, z), (0.075, 0.045, 0.06), mat)


def create_ravager():
    # Humanoid duelist with twin energy blades.
    box('Ravager pelvis', (0, 0, 1.18), (0.78, 0.52, 0.38), SLATE)
    box('Crimson chest cuirass', (0, -0.04, 1.92), (1.02, 0.62, 0.86), RED, 0.16)
    box('Chest reactor', (0, -0.37, 1.9), (0.35, 0.08, 0.42), CYAN, 0.04)
    sphere('Head', (0, -0.03, 2.52), (0.32, 0.34, 0.28), SLATE)
    box('Angular brow', (0, -0.29, 2.56), (0.56, 0.16, 0.12), RED, 0.035)
    eye_pair(2.48, AMBER, 0.14, -0.39)
    for side in (-1, 1):
        x = side * 0.32
        beam('Upper leg actuator', (x, 0, 1.13), (side * 0.4, 0, 0.58), 0.12, STEEL)
        box('Armored thigh', (side * 0.38, -0.04, 0.83), (0.35, 0.48, 0.42), RED, 0.08)
        beam('Lower leg piston', (side * 0.4, 0, 0.61), (side * 0.42, -0.02, 0.22), 0.085, BLACK)
        box('Duelist foot', (side * 0.42, -0.16, 0.14), (0.42, 0.62, 0.22), SLATE, 0.06)
        beam('Shoulder joint', (side * 0.55, 0, 2.18), (side * 0.78, 0, 1.99), 0.13, BLACK)
        box('Shoulder plate', (side * 0.78, -0.01, 2.16), (0.48, 0.66, 0.42), RED, 0.12)
        beam('Arm', (side * 0.78, -0.02, 1.99), (side * 0.86, -0.16, 1.43), 0.1, STEEL)
        sphere('Wrist emitter', (side * 0.86, -0.16, 1.4), (0.16, 0.15, 0.14), BLACK)
        blade = box('Energy blade', (side * 0.88, -0.2, 0.82), (0.12, 0.16, 1.05), CYAN, 0.025)
        blade.rotation_euler[1] = side * -0.1
    cylinder('Back power cell', (0, 0.37, 1.93), 0.25, 0.5, BLACK, 12, (math.pi / 2, 0, 0))


def create_vectra():
    # Low mobile sniper chassis with a long precision railgun.
    box('Vectra armored chassis', (0, 0.02, 0.92), (1.25, 1.2, 0.64), BLUE, 0.18)
    box('Top sensor deck', (0, -0.13, 1.34), (0.78, 0.6, 0.28), SLATE)
    cylinder('Rotating turret ring', (0, -0.1, 1.53), 0.36, 0.15, STEEL, 20)
    box('Sniper turret', (0, -0.18, 1.78), (0.8, 0.65, 0.42), BLUE, 0.11)
    # Barrel points forward along -Y.
    cylinder('Long railgun barrel', (0, -1.06, 1.79), 0.105, 1.45, STEEL, 12, (math.pi / 2, 0, 0))
    cylinder('Muzzle brake', (0, -1.82, 1.79), 0.19, 0.23, BLACK, 12, (math.pi / 2, 0, 0))
    box('Barrel cyan rail', (0, -1.03, 1.91), (0.06, 1.42, 0.055), CYAN, 0.015)
    box('Optic housing', (0.22, -0.4, 2.13), (0.34, 0.4, 0.2), BLACK, 0.05)
    sphere('Sniper lens', (0.22, -0.62, 2.13), (0.11, 0.05, 0.09), CYAN)
    for side in (-1, 1):
        wheel('Drive wheel', (side * 0.72, -0.34, 0.55), 0.36, 0.2, BLACK)
        wheel('Drive wheel', (side * 0.72, 0.4, 0.55), 0.36, 0.2, BLACK)
        wheel('Drive wheel', (side * 0.72, 0.05, 0.55), 0.31, 0.2, STEEL)
        box('Side armor skirt', (side * 0.68, 0.03, 0.96), (0.16, 0.94, 0.3), SLATE, 0.04)
        for y in (-0.38, 0.04, 0.42):
            cylinder('Wheel hub', (side * 0.84, y, 0.55), 0.105, 0.04, CYAN, 12, (0, math.pi / 2, 0))
    box('Front rangefinder', (0, -0.62, 1.18), (0.48, 0.08, 0.1), AMBER, 0.02)


def create_protector():
    # Armored guardian with a projected energy shield and broad stance.
    box('Protector armored torso', (0, 0.02, 1.86), (1.28, 0.78, 0.98), WHITE, 0.17)
    box('Chest core housing', (0, -0.43, 1.95), (0.56, 0.13, 0.56), SLATE, 0.08)
    sphere('Shield reactor', (0, -0.52, 1.96), (0.18, 0.09, 0.2), CYAN)
    box('Head sensor block', (0, -0.05, 2.53), (0.58, 0.48, 0.35), SLATE, 0.1)
    box('Visor', (0, -0.3, 2.55), (0.43, 0.06, 0.1), CYAN, 0.02)
    for side in (-1, 1):
        beam('Heavy leg', (side * 0.43, 0, 1.4), (side * 0.58, -0.06, 0.45), 0.16, STEEL)
        box('Leg guard', (side * 0.57, -0.14, 0.86), (0.42, 0.42, 0.58), WHITE, 0.1)
        box('Foot', (side * 0.58, -0.2, 0.18), (0.62, 0.7, 0.28), SLATE, 0.07)
        beam('Shoulder link', (side * 0.66, 0, 2.15), (side * 0.92, -0.03, 1.87), 0.15, BLACK)
        box('Shoulder armor', (side * 0.93, 0, 2.17), (0.52, 0.77, 0.48), WHITE, 0.12)
    # Large emitter dish on left forearm and a compact glowing shield panel.
    beam('Shield arm', (-0.92, 0, 1.9), (-1.05, -0.08, 1.25), 0.13, STEEL)
    cylinder('Shield emitter', (-1.05, -0.16, 1.2), 0.28, 0.18, CYAN, 20, (math.pi / 2, 0, 0))
    panel = box('Projected shield face', (-1.48, -0.26, 1.34), (0.08, 0.72, 1.18), CYAN, 0.04)
    panel.data.materials.clear()
    panel.data.materials.append(CYAN)
    box('Right arm cannon', (0.96, -0.2, 1.35), (0.34, 0.76, 0.34), SLATE, 0.07)


def create_reaper():
    # Six-legged spider machine with a low armored body and forward stinger.
    sphere('Reaper central abdomen', (0, 0.1, 1.28), (0.72, 0.82, 0.46), PURPLE)
    box('Top armored carapace', (0, 0.03, 1.55), (1.2, 1.05, 0.42), SLATE, 0.18)
    sphere('Central reactor eye', (0, -0.54, 1.52), (0.24, 0.12, 0.21), AMBER)
    box('Forward sensor brow', (0, -0.64, 1.72), (0.72, 0.18, 0.13), PURPLE, 0.04)
    for idx, side in enumerate((-1, 1)):
        for fore_aft in (-1, 0, 1):
            root = (side * 0.48, fore_aft * 0.28, 1.3)
            knee = (side * (1.03 + 0.08 * abs(fore_aft)), fore_aft * 0.55, 0.95)
            toe = (side * (1.48 + 0.12 * abs(fore_aft)), fore_aft * 0.78, 0.12)
            sphere('Leg pivot', root, (0.16, 0.16, 0.16), STEEL)
            beam('Upper articulated leg', root, knee, 0.085, BLACK)
            sphere('Knee joint', knee, (0.13, 0.13, 0.13), AMBER)
            beam('Lower pointed leg', knee, toe, 0.06, STEEL)
            cone_end = (toe[0] + side * 0.12, toe[1] - 0.05, 0.02)
            beam('Foot talon', toe, cone_end, 0.045, PURPLE)
    cylinder('Rear sensor mast', (0, 0.57, 2.0), 0.055, 0.62, STEEL)
    sphere('Mast beacon', (0, 0.57, 2.33), (0.12, 0.12, 0.12), CYAN)
    cylinder('Forward stinger cannon', (0, -0.97, 1.28), 0.12, 0.72, BLACK, 12, (math.pi / 2, 0, 0))


def create_blitzer():
    # Aerodynamic hover shell with four exposed lift turbines.
    box('Blitzer flight hull', (0, 0, 1.08), (1.42, 1.58, 0.62), YELLOW, 0.22)
    # Tapered nose, pointing toward -Y.
    cylinder('Aero nose cone', (0, -0.98, 1.08), 0.4, 0.72, YELLOW, 8, (math.pi / 2, 0, 0), 0.06)
    box('Black cockpit canopy', (0, -0.06, 1.45), (0.74, 0.72, 0.22), SLATE, 0.1)
    box('Canopy light band', (0, -0.43, 1.46), (0.52, 0.07, 0.08), CYAN, 0.02)
    for side in (-1, 1):
        for fore_aft in (-1, 1):
            x, y = side * 0.84, fore_aft * 0.55
            cylinder('Lift turbine nacelle', (x, y, 0.82), 0.32, 0.46, SLATE, 20)
            cylinder('Turbine cyan ring', (x, y, 0.57), 0.25, 0.06, CYAN, 20)
            cylinder('Turbine intake', (x, y, 0.53), 0.15, 0.08, BLACK, 16)
            for spoke in range(4):
                angle = spoke * math.pi / 2
                box('Turbine vane', (x + math.cos(angle) * 0.13, y + math.sin(angle) * 0.13, 0.47), (0.05, 0.22, 0.04), STEEL, 0.01, (0, 0, angle))
    box('Left winglet', (-0.93, 0.0, 1.02), (0.6, 0.22, 0.12), AMBER, 0.04, (0, -0.12, -0.1))
    box('Right winglet', (0.93, 0.0, 1.02), (0.6, 0.22, 0.12), AMBER, 0.04, (0, 0.12, 0.1))
    box('Ventral pulse cannon', (0, -0.62, 0.65), (0.22, 0.62, 0.18), BLACK, 0.04)


def create_dominator():
    # Massive biped siege platform with two long heavy cannons.
    box('Dominator pelvis block', (0, 0.02, 1.45), (1.25, 0.72, 0.52), OLIVE, 0.12)
    box('Siege torso', (0, 0, 2.18), (1.7, 0.98, 1.0), OLIVE, 0.19)
    box('Command sensor', (0, -0.53, 2.55), (0.56, 0.12, 0.3), BLACK, 0.05)
    eye_pair(2.55, AMBER, 0.17, -0.62)
    box('Reinforced chest plate', (0, -0.53, 2.04), (0.84, 0.12, 0.38), STEEL, 0.06)
    for side in (-1, 1):
        x = side * 0.63
        beam('Thick upper leg', (x, 0, 1.44), (side * 0.72, 0.02, 0.76), 0.22, BLACK)
        box('Armored shin', (side * 0.72, -0.04, 0.46), (0.62, 0.74, 0.72), OLIVE, 0.12)
        box('Siege foot', (side * 0.72, -0.22, 0.13), (0.78, 0.96, 0.26), BLACK, 0.06)
        box('Shoulder mount', (side * 1.0, 0.0, 2.42), (0.72, 1.02, 0.78), SLATE, 0.12)
        cylinder('Siege cannon barrel', (side * 1.04, -0.95, 2.43), 0.18, 1.48, STEEL, 12, (math.pi / 2, 0, 0))
        cylinder('Cannon muzzle', (side * 1.04, -1.74, 2.43), 0.28, 0.28, BLACK, 12, (math.pi / 2, 0, 0))
        cylinder('Muzzle glow', (side * 1.04, -1.9, 2.43), 0.14, 0.04, AMBER, 12, (math.pi / 2, 0, 0))
        box('Cannon cyan charge rail', (side * 1.04, -0.93, 2.62), (0.08, 1.35, 0.06), CYAN, 0.02)
    box('Back ammunition slab', (0, 0.57, 2.06), (1.18, 0.42, 0.72), SLATE, 0.1)
    for side in (-1, 1):
        for z in (1.82, 2.1, 2.38):
            cylinder('Ammo cell cap', (side * 0.37, 0.8, z), 0.075, 0.05, AMBER, 12, (math.pi / 2, 0, 0))


ROBOT_BUILDERS = [
    ('Ravager', 'mech_ravager.glb', create_ravager),
    ('Vectra', 'mech_vectra.glb', create_vectra),
    ('Protector', 'mech_protector.glb', create_protector),
    ('Reaper', 'mech_reaper.glb', create_reaper),
    ('Blitzer', 'mech_blitzer.glb', create_blitzer),
    ('Dominator', 'mech_dominator.glb', create_dominator),
]


bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for block in bpy.data.collections:
    if block.name != 'Collection' and block.users == 0:
        bpy.data.collections.remove(block)

created_objects = []
for index, (name, filename, builder) in enumerate(ROBOT_BUILDERS):
    bpy.ops.object.select_all(action='DESELECT')
    before = set(bpy.context.scene.objects)
    builder()
    robot_objects = [obj for obj in bpy.context.scene.objects if obj not in before]
    # Name and collection make the editable source scene easy to inspect.
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    for obj in robot_objects:
        for old_collection in list(obj.users_collection):
            old_collection.objects.unlink(obj)
        collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in robot_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = robot_objects[0]
    bpy.ops.export_scene.gltf(
        filepath=str(MODEL_DIR / filename),
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False
    )
    created_objects.append((name, robot_objects))
    # Arrange a source-only lineup after export; each GLB remains centered.
    column = index % 3
    row = index // 3
    offset = Vector((column * 5.0 - 5.0, row * 6.5, 0))
    for obj in robot_objects:
        obj.location += offset

bpy.ops.object.select_all(action='DESELECT')
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_DIR / 'robot_roster.blend'))
print('Exported six additional robot models to', MODEL_DIR)
