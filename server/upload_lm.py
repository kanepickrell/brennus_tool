# upload_lm.py
from arango import ArangoClient
import json
from datetime import datetime

# Connect
client = ArangoClient(hosts='http://localhost:8529')
db = client.db('DB_318', username='root', password='devpass')

# =====================================================
# 1. CLEAN UP OLD DATA (Optional but recommended)
# =====================================================
print("🧹 Cleaning up old LibraryModule documents...")

if db.has_collection('LibraryModule'):
    collection = db.collection('LibraryModule')
    
    # Option A: Delete all documents (clean slate)
    collection.truncate()
    print("   ✅ Truncated LibraryModule collection")
    
    # Option B: Delete specific old keys (if you want to preserve some)
    # old_keys = ['lib_cs_spawn_process', 'lib_cs_mimikatz', ...]
    # for key in old_keys:
    #     if collection.has(key):
    #         collection.delete(key)
    #         print(f"   ✅ Deleted old: {key}")
else:
    # Create collection if it doesn't exist
    db.create_collection('LibraryModule')
    print("   ✅ Created LibraryModule collection")

collection = db.collection('LibraryModule')

# =====================================================
# 2. CREATE/UPDATE ObjectType COLLECTION
# =====================================================
print("\n📦 Setting up ObjectType collection...")

if not db.has_collection('ObjectType'):
    db.create_collection('ObjectType')
    print("   ✅ Created ObjectType collection")
else:
    print("   ✅ ObjectType collection exists")

object_type_collection = db.collection('ObjectType')

# =====================================================
# 3. LOAD AND VALIDATE JSON
# =====================================================
print("\n📂 Loading package data...")

with open('sample_lm_data.json', 'r', encoding='utf-8') as f:
    package = json.load(f)

print(f"   ✅ Loaded package version: {package.get('packageVersion', 'unknown')}")

# =====================================================
# 4. UPLOAD OBJECT TYPES FIRST
# =====================================================
print("\n🔤 Uploading ObjectTypes...")

for collection_def in package.get('collections', []):
    if collection_def['name'] == 'ObjectType':
        object_types = collection_def.get('documents', [])
        
        for obj_type in object_types:
            try:
                if object_type_collection.has(obj_type['_key']):
                    object_type_collection.update(obj_type)
                    print(f"   ✅ Updated ObjectType: {obj_type['name']}")
                else:
                    object_type_collection.insert(obj_type)
                    print(f"   ✅ Inserted ObjectType: {obj_type['name']}")
            except Exception as e:
                print(f"   ❌ Error with ObjectType {obj_type.get('name', 'unknown')}: {e}")

# =====================================================
# 5. UPLOAD LIBRARY MODULES
# =====================================================
print("\n🔧 Uploading LibraryModules...")

modules_uploaded = 0
modules_updated = 0
modules_failed = 0

for collection_def in package.get('collections', []):
    if collection_def['name'] == 'LibraryModule':
        modules = collection_def.get('documents', [])
        
        for module in modules:
            try:
                # Validate required fields
                if '_key' not in module or 'name' not in module:
                    print(f"   ⚠️  Skipping invalid module (missing _key or name)")
                    modules_failed += 1
                    continue
                
                # Check if module exists
                if collection.has(module['_key']):
                    collection.update(module)
                    print(f"   ✅ Updated: {module['name']} ({module['_key']})")
                    modules_updated += 1
                else:
                    collection.insert(module)
                    print(f"   ✅ Inserted: {module['name']} ({module['_key']})")
                    modules_uploaded += 1
                    
            except Exception as e:
                print(f"   ❌ Error with {module.get('name', 'unknown')}: {e}")
                modules_failed += 1

# =====================================================
# 6. SUMMARY
# =====================================================
print("\n" + "="*60)
print("📊 UPLOAD SUMMARY")
print("="*60)
print(f"✅ New modules inserted:  {modules_uploaded}")
print(f"🔄 Existing modules updated: {modules_updated}")
print(f"❌ Failed modules:        {modules_failed}")
print(f"📦 Total modules in DB:   {collection.count()}")
print(f"🔤 Total ObjectTypes:     {object_type_collection.count()}")
print("="*60)

# =====================================================
# 7. VALIDATION CHECKS
# =====================================================
print("\n🔍 Running validation checks...")

# Check for orphaned types (used in modules but not defined in ObjectType)
all_types_used = set()
all_types_defined = set(doc['_key'] for doc in object_type_collection.all())

for module in collection.all():
    # Check input types
    for inp in module.get('inputs', []):
        all_types_used.add(inp['type'])
    
    # Check output types
    for out in module.get('outputs', []):
        all_types_used.add(out['type'])

orphaned_types = all_types_used - all_types_defined

if orphaned_types:
    print(f"   ⚠️  Undefined types referenced: {', '.join(orphaned_types)}")
else:
    print(f"   ✅ All referenced types are defined")

# Check for modules without outputObjects
modules_without_outputs = []
for module in collection.all():
    if not module.get('outputObjects'):
        modules_without_outputs.append(module['name'])

if modules_without_outputs:
    print(f"   ⚠️  Modules without outputObjects: {', '.join(modules_without_outputs)}")
else:
    print(f"   ✅ All modules have outputObjects defined")

print("\n🎉 Upload complete!")