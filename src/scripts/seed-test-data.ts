import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || 'YOUR_MONGO_URI_HERE';

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const projectCollection = mongoose.connection.collection('projects');
  const employeeCollection = mongoose.connection.collection('employees');

  // Insert test project
  const existingProject = await projectCollection.findOne({ row_number: 1 });
  if (!existingProject) {
    await projectCollection.insertOne({
      title: 'AVA Landing Page',
      description: 'Build a complete landing page for AVA product including design, development and marketing content',
      techStack: ['React', 'Flutter', 'NestJS'],
      status: 'accepted',
      row_number: 1,
      type_projet: 'Web Development',
      budget_estime: 5000,
      periode: '1 mois',
      tags: ['web', 'design', 'marketing'],
      trelloDispatchDone: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log('Test project inserted');
  } else {
    console.log('Test project already exists');
  }

  // Insert test employees
  const emp1 = await employeeCollection.findOne({ 
    email: 'mohamedsaidhachani93274190@gmail.com' 
  });
  if (!emp1) {
    await employeeCollection.insertOne({
      fullName: 'Mohamed Said',
      email: 'mohamedsaidhachani93274190@gmail.com',
      profile: 'Frontend Developer',
      skills: ['React', 'Flutter', 'UI/UX'],
      tags: ['frontend', 'mobile'],
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log('Employee 1 inserted');
  }

  const emp2 = await employeeCollection.findOne({ 
    email: 'cherniasma68@gmail.com' 
  });
  if (!emp2) {
    await employeeCollection.insertOne({
      fullName: 'Asma Cherni',
      email: 'cherniasma68@gmail.com',
      profile: 'Marketing',
      skills: ['Social Media', 'Content Writing', 'SEO'],
      tags: ['marketing', 'content'],
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log('Employee 2 inserted');
  }

  console.log('Seed complete');
  await mongoose.disconnect();
}

seed().catch(console.error);
