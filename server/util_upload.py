# upload_utilities.py
from arango import ArangoClient
import json
from datetime import datetime

# Connect
client = ArangoClient(hosts='http://localhost:8529')
db = client.db('DB_318', username='root', password='devpass')

# =====================================================
# 1. GET EXISTING COLLECTIONS (NO DELETION)
# =====================================================
print("📦 Connecting to existing collections...")

if not db.has_collection('LibraryModule'):
    db.create_collection('LibraryModule')
    print("   ✅ Created LibraryModule collection")
else:
    print("   ✅ LibraryModule collection exists")

collection = db.collection('LibraryModule')

if not db.has_collection('ObjectType'):
    db.create_collection('ObjectType')
    print("   ✅ Created ObjectType collection")
else:
    print("   ✅ ObjectType collection exists")

object_type_collection = db.collection('ObjectType')

# =====================================================
# 2. LOAD UTILITIES JSON
# =====================================================
print("\n📂 Loading utilities package...")

with open('utilities_upload_lm.json', 'r', encoding='utf-8') as f:
    package = json.load(f)

print(f"   ✅ Loaded package version: {package.get('packageVersion', 'unknown')}")

# =====================================================
# 3. UPLOAD NEW OBJECT TYPES
# =====================================================
print("\n🔤 Uploading new ObjectTypes...")

for collection_def in package.get('collections', []):
    if collection_def['name'] == 'ObjectType':
        object_types = collection_def.get('documents', [])
        
        for obj_type in object_types:
            try:
                if object_type_collection.has(obj_type['_key']):
                    # Update existing
                    object_type_collection.update(obj_type)
                    print(f"   🔄 Updated ObjectType: {obj_type['name']}")
                else:
                    # Insert new
                    object_type_collection.insert(obj_type)
                    print(f"   ✅ Inserted new ObjectType: {obj_type['name']}")
            except Exception as e:
                print(f"   ❌ Error with ObjectType {obj_type.get('name', 'unknown')}: {e}")

# =====================================================
# 4. UPLOAD UTILITY MODULES (APPEND TO EXISTING)
# =====================================================
print("\n🔧 Uploading Utility LibraryModules...")

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
                    # Update existing module
                    collection.update(module)
                    print(f"   🔄 Updated: {module['name']} ({module['_key']})")
                    modules_updated += 1
                else:
                    # Insert new module
                    collection.insert(module)
                    print(f"   ✅ Inserted: {module['name']} ({module['_key']})")
                    modules_uploaded += 1
                    
            except Exception as e:
                print(f"   ❌ Error with {module.get('name', 'unknown')}: {e}")
                modules_failed += 1

# =====================================================
# 5. SUMMARY
# =====================================================
print("\n" + "="*60)
print("📊 UPLOAD SUMMARY")
print("="*60)
print(f"✅ New modules inserted:     {modules_uploaded}")
print(f"🔄 Existing modules updated:  {modules_updated}")
print(f"❌ Failed modules:           {modules_failed}")
print(f"📦 Total modules in DB now:  {collection.count()}")
print(f"🔤 Total ObjectTypes:        {object_type_collection.count()}")
print("="*60)

# =====================================================
# 6. BREAKDOWN BY CATEGORY
# =====================================================
print("\n📊 Module breakdown by category:")

# Count by category
categories = {}
for module in collection.all():
    cat = module.get('category', 'Unknown')
    categories[cat] = categories.get(cat, 0) + 1

for cat, count in sorted(categories.items()):
    print(f"   {cat}: {count} modules")

# =====================================================
# 7. VALIDATION CHECKS
# =====================================================
print("\n🔍 Running validation checks...")

# Check for orphaned types
all_types_used = set()
all_types_defined = set(doc['_key'] for doc in object_type_collection.all())

for module in collection.all():
    for inp in module.get('inputs', []):
        all_types_used.add(inp['type'])
    for out in module.get('outputs', []):
        all_types_used.add(out['type'])

orphaned_types = all_types_used - all_types_defined

if orphaned_types:
    print(f"   ⚠️  Undefined types referenced: {', '.join(orphaned_types)}")
else:
    print(f"   ✅ All referenced types are defined")

print("\n🎉 Utilities upload complete!")
print("Your existing Cobalt Strike modules are still intact! ✅")