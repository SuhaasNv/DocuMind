import { motion } from 'framer-motion';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import {
  User,
  Cpu,
  Wrench,
  Code2,
  Cloud,
  GraduationCap,
  Award,
  FolderOpen,
} from 'lucide-react';

const summary =
  'M.Tech Software Engineering candidate at NUS with strong experience in deep learning systems, LLM inference optimization, and ML infrastructure. Skilled in Python, PyTorch, LangChain, and containerized deployment of high-performance AI pipelines. Experienced in building and optimizing RAG systems, vector search, and low-latency inference workflows.';

const skillCategories = [
  {
    icon: Cpu,
    title: 'AI & ML Systems',
    items: ['PyTorch', 'TensorFlow', 'LangChain', 'RAG Pipelines', 'Vector Search (FAISS, Redis, Pinecone)'],
  },
  {
    icon: Wrench,
    title: 'Tools & Agile',
    items: ['Jira', 'VS Code', 'Scrum', 'Kanban', 'REST APIs'],
  },
  {
    icon: Code2,
    title: 'Programming',
    items: ['Python', 'JavaScript (React, Node.js)', 'Java', 'SQL', 'C++ (Basic)'],
  },
  {
    icon: Cloud,
    title: 'Cloud & DevOps',
    items: ['AWS', 'Microsoft Azure', 'Docker', 'Git', 'Linux', 'Kafka', 'CI/CD'],
  },
];

const projects = [
  {
    title: 'AI Knowledge Assistant (RAG)',
    bullets: [
      'Reduced document retrieval time by ~50% by implementing a containerized Retrieval-Augmented Generation (RAG) system with an optimized Redis vector store and exploring LLM inference optimization techniques to minimize response latency.',
      'Architected and deployed the solution via Docker, demonstrating proficiency in cloud-native application setup and LLM workflow automation.',
      'Demonstrated effective communication and decision-making skills by collaborating with cross-functional team members during Agile sprints to prioritize tasks, resolve technical bottlenecks, and deliver user-centric AI solutions on schedule using Scrum and Kanban methodologies.',
    ],
  },
  {
    title: 'Plant Leaf Disease Detection System',
    bullets: [
      'Improved classification accuracy by 12% for early disease detection by applying advanced data augmentation and preprocessing techniques.',
      'Trained a novel Convolutional Neural Network (CNN) model — applying deep-learning techniques for computer-vision tasks — to classify 38 plant-disease categories across a 87,000+ image dataset, improving early-detection accuracy by 12%.',
    ],
  },
];

const education = [
  {
    school: 'National University of Singapore',
    location: 'Singapore',
    degree: 'Master of Technology, Software Engineering',
    period: 'Aug 2026',
    gpa: 'GPA: 4.0 / 5.0',
    coursework: 'Coursework: Architecting AI Systems, Designing Modern Software Solutions, Architecting Scalable Systems, Designing and Managing Products',
  },
  {
    school: 'Vellore Institute of Technology',
    location: 'Vellore, India',
    degree: 'Bachelor of Technology, Information Technology',
    period: 'Aug 2025',
    gpa: 'CGPA: 8.21',
    coursework: null,
  },
];

const certifications = [
  'AWS Cloud Practitioner – Amazon',
  'Microsoft Azure AZ-104 – Microsoft',
  'Generative AI – IBM',
  'Agile with Atlassian Jira – Atlassian',
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

const AboutPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="noise-overlay" />
      <Navbar />

      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="pt-28 pb-16"
      >
        <div className="container mx-auto px-6 max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-2">
              About the <span className="gradient-text">Creator</span>
            </h1>
            <p className="text-xl md:text-2xl font-semibold text-foreground mb-4">
              Vijaya Suhaas Nadukooru
            </p>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              M.Tech Software Engineering at NUS · Deep learning, RAG & ML infrastructure
            </p>
          </motion.div>

          {/* Summary */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-12"
          >
            <h2 className="flex items-center gap-2 text-xl font-semibold mb-4">
              <User className="w-5 h-5 text-primary" />
              Summary
            </h2>
            <p className="p-6 rounded-2xl glass-card text-muted-foreground leading-relaxed">
              {summary}
            </p>
          </motion.section>

          {/* Technical Skills */}
          <motion.section
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="mb-12"
          >
            <h2 className="flex items-center gap-2 text-xl font-semibold mb-6">
              <Cpu className="w-5 h-5 text-primary" />
              Technical Skills
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {skillCategories.map((cat) => (
                <motion.div
                  key={cat.title}
                  variants={itemVariants}
                  className="p-5 rounded-2xl glass-card hover:border-primary/30 transition-colors"
                >
                  <h3 className="flex items-center gap-2 font-medium mb-3">
                    <cat.icon className="w-4 h-4 text-primary" />
                    {cat.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {cat.items.join(' · ')}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* Projects */}
          <motion.section
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="mb-12"
          >
            <h2 className="flex items-center gap-2 text-xl font-semibold mb-6">
              <FolderOpen className="w-5 h-5 text-primary" />
              Projects
            </h2>
            <div className="space-y-6">
              {projects.map((proj) => (
                <motion.div
                  key={proj.title}
                  variants={itemVariants}
                  className="p-6 rounded-2xl glass-card hover:border-primary/30 transition-colors"
                >
                  <h3 className="font-semibold mb-3">{proj.title}</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
                    {proj.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* Education */}
          <motion.section
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="mb-12"
          >
            <h2 className="flex items-center gap-2 text-xl font-semibold mb-6">
              <GraduationCap className="w-5 h-5 text-primary" />
              Education
            </h2>
            <div className="space-y-4">
              {education.map((edu) => (
                <motion.div
                  key={edu.school}
                  variants={itemVariants}
                  className="p-6 rounded-2xl glass-card hover:border-primary/30 transition-colors"
                >
                  <div className="flex flex-wrap justify-between items-start gap-2">
                    <div>
                      <h3 className="font-semibold">{edu.school}</h3>
                      <p className="text-sm text-muted-foreground">{edu.location}</p>
                    </div>
                    <span className="text-sm text-muted-foreground">{edu.period}</span>
                  </div>
                  <p className="mt-2 font-medium text-primary/90">{edu.degree}</p>
                  <p className="text-sm text-muted-foreground mt-1">{edu.gpa}</p>
                  {edu.coursework && (
                    <p className="text-sm text-muted-foreground mt-2">{edu.coursework}</p>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* Certifications */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <h2 className="flex items-center gap-2 text-xl font-semibold mb-4">
              <Award className="w-5 h-5 text-primary" />
              Certifications & Training
            </h2>
            <div className="p-6 rounded-2xl glass-card">
              <ul className="space-y-2 text-sm text-muted-foreground">
                {certifications.map((c) => (
                  <li key={c} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </motion.section>
        </div>
      </motion.main>

      <Footer />
    </div>
  );
};

export default AboutPage;
