import bpy
import bmesh
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'assets' / 'models' / 'shield_dome.glb'

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

segments = 32
rings = 12
vertices = [(0.0, 0.0, 1.0)]
for ring in range(1, rings + 1):
    theta = (math.pi / 2) * ring / rings
    for segment in range(segments):
        phi = 2 * math.pi * segment / segments
        vertices.append((math.sin(theta) * math.cos(phi), math.sin(theta) * math.sin(phi), math.cos(theta)))

faces = []
for segment in range(segments):
    faces.append((0, 1 + segment, 1 + (segment + 1) % segments))
for ring in range(rings - 1):
    first = 1 + ring * segments
    second = first + segments
    for segment in range(segments):
        nxt = (segment + 1) % segments
        faces.append((first + segment, second + segment, second + nxt, first + nxt))

mesh = bpy.data.meshes.new('Shield dome shell mesh')
mesh.from_pydata(vertices, [], faces)
mesh.update()
bm = bmesh.new()
bm.from_mesh(mesh)
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
bm.to_mesh(mesh)
bm.free()

dome = bpy.data.objects.new('Reusable cyan energy shield dome', mesh)
bpy.context.collection.objects.link(dome)

mat = bpy.data.materials.new('Energy shield | translucent cyan')
mat.diffuse_color = (0.08, 0.8, 1.0, 0.22)
mat.use_nodes = True
nodes = mat.node_tree.nodes
shader = nodes.get('Principled BSDF')
shader.inputs['Base Color'].default_value = (0.025, 0.46, 0.68, 0.22)
shader.inputs['Metallic'].default_value = 0.15
shader.inputs['Roughness'].default_value = 0.2
shader.inputs['Alpha'].default_value = 0.22
emission = shader.inputs.get('Emission') or shader.inputs.get('Emission Color')
if emission:
    emission.default_value = (0.0, 0.48, 0.85, 1.0)
strength = shader.inputs.get('Emission Strength')
if strength:
    strength.default_value = 1.8
# Blender 5.x renamed the material transparency setting; keep compatibility
# with earlier Blender releases used by this project too.
if hasattr(mat, 'surface_render_method'):
    mat.surface_render_method = 'BLENDED'
else:
    mat.blend_method = 'BLEND'
if hasattr(mat, 'show_transparent_back'):
    mat.show_transparent_back = True
dome.data.materials.append(mat)

bpy.ops.object.select_all(action='DESELECT')
dome.select_set(True)
bpy.context.view_layer.objects.active = dome
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets' / 'source' / 'shield_dome.blend'))
bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT),
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_cameras=False,
    export_lights=False
)
print(f'Created {OUTPUT}')
