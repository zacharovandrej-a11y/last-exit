"""Derive a low-poly, continuously weighted suit from the CC0 MakeHuman base.

Run with Blender 4.3:
  blender -b --factory-startup --python build_mesh.py -- SOURCE_DIR model.json
SOURCE_DIR contains base.obj, default.mhskel and default_weights.mhw.
"""
import json
import sys
from pathlib import Path

import bmesh
import bpy

source, output = map(Path, sys.argv[sys.argv.index("--") + 1:])
vertices, faces = [], []
body = False
for line in (source / "base.obj").read_text().splitlines():
    if line.startswith("v "):
        vertices.append(tuple(map(float, line.split()[1:])))
    elif line.startswith("g "):
        body = line.split()[1] == "body"
    elif body and line.startswith("f "):
        faces.append([int(word.split("/")[0]) - 1 for word in line.split()[1:]])

skeleton = json.loads((source / "default.mhskel").read_text())
weights = json.loads((source / "default_weights.mhw").read_text())["weights"]
SCALE = 3.0


def joint(bone, end="head"):
    ids = skeleton["joints"][skeleton["bones"][bone][end]]
    return [sum(vertices[i][axis] for i in ids) / len(ids) * SCALE for axis in range(3)]


bones = [
    [joint("spine05"), joint("spine04")],
    [joint("spine04"), joint("spine02")],
    [joint("spine02"), joint("neck01")],
    [joint("neck01"), joint("head", "tail")],
]
for side in ("L", "R"):
    for chain in (("upperarm01", "lowerarm01", "wrist", "finger3-1"),
                  ("upperleg01", "lowerleg01", "foot", "toe1-2")):
        points = [joint(f"{part}.{side}") for part in chain]
        bones.extend([[a, b] for a, b in zip(points, points[1:])])


def group(name):
    part, _, side = name.partition(".")
    side_offset = 6 if side == "R" else 0
    if part.startswith("upperarm"):
        return 4 + side_offset
    if part.startswith("lowerarm"):
        return 5 + side_offset
    if part.startswith(("wrist", "finger", "metacarpal")):
        return 6 + side_offset
    if part.startswith("upperleg"):
        return 7 + side_offset
    if part.startswith("lowerleg"):
        return 8 + side_offset
    if part.startswith(("foot", "toe")):
        return 9 + side_offset
    if part in ("root", "pelvis", "spine05"):
        return 0
    if part in ("spine03", "spine04"):
        return 1
    if part.startswith(("spine", "breast", "clavicle", "shoulder")):
        return 2
    return 3


# Import only the surface. The OBJ also has joints and clothing-fit helpers.
ids = sorted({i for face in faces for i in face})
remap = {i: n for n, i in enumerate(ids)}
points = []
for i in ids:
    x, y, z = vertices[i]
    taper = 1 - .12 * max(0, 1 - abs(y - 1.5) / 2.0)
    if abs(x) < 1.35:
        x *= taper
    if abs(x) < .50 and -1.9 < y < .45 and z > .36:
        z = .36 + (z - .36) * .24  # smooth suit front
    points.append((x * SCALE, y * SCALE, z * SCALE))

mesh = bpy.data.meshes.new("CC0 MakeHuman suit")
mesh.from_pydata(points, [], [[remap[i] for i in face] for face in faces])
mesh.update()
# Close eye/mouth boundaries as part of the continuous hood.
edit = bmesh.new()
edit.from_mesh(mesh)
bmesh.ops.holes_fill(edit, edges=[edge for edge in edit.edges if edge.is_boundary], sides=64)
edit.to_mesh(mesh)
edit.free()

obj = bpy.data.objects.new("Suit", mesh)
bpy.context.collection.objects.link(obj)
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
groups = [obj.vertex_groups.new(name=str(i)) for i in range(len(bones))]
accum = [{} for _ in ids]
for bone, entries in weights.items():
    bone_id = group(bone)
    for i, weight in entries:
        if i in remap:
            record = accum[remap[i]]
            record[bone_id] = record.get(bone_id, 0) + weight
for i, record in enumerate(accum):
    for bone_id, weight in record.items():
        groups[bone_id].add([i], min(1, weight), "REPLACE")

decimate = obj.modifiers.new("Mobile mesh budget", "DECIMATE")
decimate.ratio = .108
decimate.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=decimate.name)
# Relax the lower-back contour around the glute-to-thigh transition.
rear = obj.vertex_groups.new(name="Rear contour")
for vertex in obj.data.vertices:
    x, y, z = vertex.co
    weight = max(0, 1 - abs(y - 1.0) / 6.0) * min(1, max(0, (-z - .3) / 1.8))
    if weight > 0:
        rear.add([vertex.index], weight, "REPLACE")
smooth = obj.modifiers.new("Round lower-back contour", "SMOOTH")
smooth.vertex_group = rear.name
smooth.factor = .64
smooth.iterations = 3
bpy.ops.object.modifier_apply(modifier=smooth.name)
obj.vertex_groups.remove(obj.vertex_groups["Rear contour"])

mesh = obj.data
mesh.calc_loop_triangles()
assert len(mesh.loop_triangles) <= 3000
joint_ids, joint_weights = [], []
for vertex in mesh.vertices:
    if vertex.co.y > 19.5:
        joint_ids.extend((3, 0, 0, 0))
        joint_weights.extend((1, 0, 0, 0))
        continue
    record = sorted(((item.weight, item.group) for item in vertex.groups), reverse=True)[:4]
    record += [(0, 0)] * (4 - len(record))
    total = sum(weight for weight, _ in record)
    assert total > 0, f"Unweighted vertex {vertex.index}"
    joint_ids.extend(i for _, i in record)
    joint_weights.extend(round(weight / total, 4) for weight, _ in record)

model = {
    "eyes": [joint("eye.L"), joint("eye.R")],
    "positions": [round(float(value), 4) for vertex in mesh.vertices for value in vertex.co],
    "indices": [i for tri in mesh.loop_triangles for i in tri.vertices],
    "joints": joint_ids, "weights": joint_weights, "bones": bones,
}
output.write_text(json.dumps(model, separators=(",", ":")) + "\n")
print(f"{len(mesh.vertices)} vertices, {len(mesh.loop_triangles)} triangles, {len(bones)} bones")
