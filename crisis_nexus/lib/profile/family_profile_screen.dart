import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class FamilyProfileScreen extends StatefulWidget {
  const FamilyProfileScreen({Key? key}) : super(key: key);

  @override
  State<FamilyProfileScreen> createState() => _FamilyProfileScreenState();
}

class _FamilyProfileScreenState extends State<FamilyProfileScreen> {
  final User? user = FirebaseAuth.instance.currentUser;

  void _showAddMemberDialog(BuildContext context, {DocumentSnapshot? existingMember}) {
    final nameController = TextEditingController(text: existingMember?['name'] ?? '');
    final ageController = TextEditingController(text: existingMember?['age']?.toString() ?? '');
    String selectedRelation = existingMember?['relation'] ?? 'Child';
    String selectedType = existingMember?['type'] ?? 'Child';

    showDialog(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setState) {
            return AlertDialog(
              backgroundColor: const Color(0xFF161922),
              title: Text(existingMember == null ? 'Add Family Member' : 'Edit Family Member', style: const TextStyle(color: Colors.white)),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: nameController,
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: 'Name (Optional)',
                        labelStyle: TextStyle(color: Colors.white.withOpacity(0.6)),
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: ageController,
                      keyboardType: TextInputType.number,
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: 'Age',
                        labelStyle: TextStyle(color: Colors.white.withOpacity(0.6)),
                      ),
                    ),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      value: selectedRelation,
                      dropdownColor: const Color(0xFF161922),
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: 'Relation',
                        labelStyle: TextStyle(color: Colors.white.withOpacity(0.6)),
                      ),
                      items: ['Parent', 'Child', 'Spouse', 'Sibling', 'Grandparent', 'Other']
                          .map((r) => DropdownMenuItem(value: r, child: Text(r)))
                          .toList(),
                      onChanged: (val) {
                        setState(() => selectedRelation = val!);
                      },
                    ),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      value: selectedType,
                      dropdownColor: const Color(0xFF161922),
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: 'Vulnerability Type',
                        labelStyle: TextStyle(color: Colors.white.withOpacity(0.6)),
                      ),
                      items: ['Adult', 'Child', 'Elderly', 'Disabled', 'Pregnant']
                          .map((t) => DropdownMenuItem(value: t, child: Text(t)))
                          .toList(),
                      onChanged: (val) {
                        setState(() => selectedType = val!);
                      },
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Cancel', style: TextStyle(color: Colors.grey)),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF007AFF)),
                  onPressed: () async {
                    if (user == null) return;
                    
                    final age = int.tryParse(ageController.text) ?? 0;
                    final memberData = {
                      'name': nameController.text,
                      'age': age,
                      'relation': selectedRelation,
                      'type': selectedType,
                    };

                    final membersRef = FirebaseFirestore.instance
                        .collection('family_profiles')
                        .doc(user!.uid)
                        .collection('members');

                    if (existingMember == null) {
                      await membersRef.add(memberData);
                    } else {
                      await membersRef.doc(existingMember.id).update(memberData);
                    }

                    if (context.mounted) Navigator.pop(context);
                  },
                  child: const Text('Save', style: TextStyle(color: Colors.white)),
                ),
              ],
            );
          }
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    if (user == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Family Profile')),
        body: const Center(child: Text('User not authenticated')),
      );
    }

    final familyRef = FirebaseFirestore.instance.collection('family_profiles').doc(user!.uid);

    return Scaffold(
      backgroundColor: const Color(0xFF0A0B10),
      appBar: AppBar(
        title: const Text('Family Profile'),
        backgroundColor: Colors.transparent,
      ),
      body: Column(
        children: [
          // Summary Header
          StreamBuilder<DocumentSnapshot>(
            stream: familyRef.snapshots(),
            builder: (context, snapshot) {
              int householdSize = 0;
              List<String> vulnerabilities = [];

              if (snapshot.hasData && snapshot.data!.exists) {
                final data = snapshot.data!.data() as Map<String, dynamic>;
                householdSize = data['householdSize'] ?? 0;
                vulnerabilities = List<String>.from(data['vulnerabilities'] ?? []);
              }

              return Container(
                padding: const EdgeInsets.all(20),
                margin: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFF161922),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFF007AFF).withOpacity(0.3)),
                ),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Household Size', style: TextStyle(color: Colors.grey)),
                        Text('$householdSize members', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Vulnerabilities', style: TextStyle(color: Colors.grey)),
                        Expanded(
                          child: Text(
                            vulnerabilities.isEmpty ? 'None' : vulnerabilities.join(', '),
                            style: const TextStyle(color: Color(0xFFFD3C5B), fontWeight: FontWeight.bold),
                            textAlign: TextAlign.right,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            },
          ),
          
          // Members List
          Expanded(
            child: StreamBuilder<QuerySnapshot>(
              stream: familyRef.collection('members').snapshots(),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }

                if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
                  return const Center(
                    child: Text('No family members added yet.', style: TextStyle(color: Colors.grey)),
                  );
                }

                final docs = snapshot.data!.docs;
                return ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: docs.length,
                  itemBuilder: (context, index) {
                    final doc = docs[index];
                    final data = doc.data() as Map<String, dynamic>;
                    return Card(
                      color: const Color(0xFF161922),
                      margin: const EdgeInsets.only(bottom: 12),
                      child: ListTile(
                        title: Text(data['name']?.isNotEmpty == true ? data['name'] : 'Unnamed ${data['relation']}', style: const TextStyle(color: Colors.white)),
                        subtitle: Text('${data['relation']} • Age ${data['age']} • ${data['type']}', style: const TextStyle(color: Colors.grey)),
                        trailing: IconButton(
                          icon: const Icon(Icons.edit, color: Color(0xFF007AFF)),
                          onPressed: () => _showAddMemberDialog(context, existingMember: doc),
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: const Color(0xFF007AFF),
        icon: const Icon(Icons.add, color: Colors.white),
        label: const Text('Add Member', style: TextStyle(color: Colors.white)),
        onPressed: () => _showAddMemberDialog(context),
      ),
    );
  }
}
