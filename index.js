#!/usr/bin/env node
import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

console.log(chalk.bold.cyan('\n🚀 UNIFORM PROJECT GENERATOR\n'));

// Questions
const questions = [
  {
    type: 'input',
    name: 'projectName',
    message: 'Project name?',
    default: 'my-app',
    validate: (input) => {
      if (/^[a-z0-9-]+$/.test(input)) return true;
      return 'Project name must be lowercase, alphanumeric, and hyphens only';
    }
  },
  {
  type: 'list',
  name: 'projectType',
  message: 'What are you building?',
  choices: [
    { name: 'Full-stack (Flask + React)', value: 'fullstack' },
    { name: 'Backend API only (Flask)', value: 'backend-only' },
    { name: 'Frontend only (React)', value: 'frontend-only' },
  ]
},
{
  type: 'list',
  name: 'apiConsumer',
  message: 'This API will be consumed by:',
  when: (answers) => answers.projectType === 'backend-only',
  choices: [
    { name: 'Mobile app (iOS/Android)', value: 'mobile' },
    { name: 'Third-party integrations', value: 'third-party' },
    { name: 'My own frontend (building later)', value: 'own-frontend' },
    { name: 'Microservices/Internal use', value: 'internal' },
  ]
},
{
  type: 'list',
  name: 'backendNeeded',
  message: 'Does this frontend need a backend?',
  when: (answers) => answers.projectType === 'frontend-only',
  choices: [
    { name: 'No - Static site or uses existing API', value: 'none' },
    { name: 'Yes - But building separately', value: 'separate' },
  ]
},
  {
    type: 'input',
    name: 'entities',
    message: 'Entities? (comma-separated, e.g., User,Recipe,Category)',
    when: (answers) => answers.projectType !== 'frontend-only',
    validate: (input) => {
      if (input.trim().length > 0) return true;
      return 'You need at least one entity';
    }
  },
  {
  type: 'confirm',
  name: 'hasRelationships',
  message: 'Do your entities have relationships?',
  when: (answers) => {
    const entities = answers.entities ? answers.entities.split(',').map(e => e.trim()) : [];
    return entities.length > 1 && answers.projectType !== 'frontend-only';
  },
  default: true
},
  {
    type: 'checkbox',
    name: 'features',
    message: 'Select features:',
    choices: [
      { name: 'Authentication', value: 'auth', checked: false },
      { name: 'Admin Panel', value: 'admin', checked: false },
      { name: 'File Uploads', value: 'uploads', checked: false },
    ]
  },
  {
    type: 'confirm',
    name: 'confirm',
    message: (answers) => {
      return `Create ${chalk.cyan(answers.projectName)} as a ${chalk.yellow(answers.projectType)} project?`;
    },
    default: true
  }
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function showProgress(message, duration = 1000) {
  process.stdout.write(chalk.cyan(message));
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  
  const interval = setInterval(() => {
    process.stdout.write(`\r${chalk.cyan(message)} ${frames[i++ % frames.length]}`);
  }, 80);
  
  await sleep(duration);
  clearInterval(interval);
  process.stdout.write(`\r${chalk.green('✅ ' + message)}\n`);
}

async function askRelationships(entities) {
  const relationships = [];
  
  console.log(chalk.cyan('\n🔗 Define Relationships\n'));
  
  // Ask about each pair of entities
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const entity1 = entities[i];
      const entity2 = entities[j];
      
      const answer = await inquirer.prompt([
        {
          type: 'list',
          name: 'relationship',
          message: `${entity1} ↔ ${entity2}:`,
          choices: [
            { 
              name: `No relationship`, 
              value: 'none' 
            },
            { 
              name: `${entity1} belongs to ONE ${entity2} (adds ${entity2.toLowerCase()}_id to ${entity1})`, 
              value: 'entity1-to-entity2' 
            },
            { 
              name: `${entity2} belongs to ONE ${entity1} (adds ${entity1.toLowerCase()}_id to ${entity2})`, 
              value: 'entity2-to-entity1' 
            },
            { 
              name: `Many-to-Many (creates bridge table)`, 
              value: 'many-to-many' 
            },
          ]
        }
      ]);
      
      if (answer.relationship !== 'none') {
        relationships.push({
          entity1,
          entity2,
          type: answer.relationship
        });
      }
    }
  }
  
  return relationships;
}

function buildSmartConfig(answers, entities, relationships) {
  const config = {
    projectName: answers.projectName,
    projectType: answers.projectType,
    entities: entities,
    relationships: relationships,
    features: answers.features,
    
    // Core decisions
    needsFrontend: answers.projectType !== 'backend-only',
    needsBackend: answers.projectType !== 'frontend-only',
    
    // Kill switches
    killSwitches: {
      skipFrontend: answers.projectType === 'backend-only',
      skipBackend: answers.projectType === 'frontend-only',
      skipRelationships: entities.length <= 1,
      skipProviders: answers.projectType === 'frontend-only' || entities.length === 0,
      skipApiService: answers.projectType === 'frontend-only' && answers.backendNeeded === 'none',
    },
    
    // Backend optimizations
    backend: {
      apiConsumer: answers.apiConsumer,
      needsCORS: answers.apiConsumer !== 'internal',
      needsApiDocs: answers.apiConsumer === 'mobile' || answers.apiConsumer === 'third-party',
      needsVersioning: answers.apiConsumer === 'mobile',
    },
    
    // Frontend optimizations  
    frontend: {
      backendNeeded: answers.backendNeeded,
      isStatic: answers.projectType === 'frontend-only' && answers.backendNeeded === 'none',
    }
  };
  
  return config;
}

function showGenerationSummary(projectPath, config) {
  console.log(chalk.bold.cyan('\n📊 Generation Summary:\n'));
  
  // Count files
  let fileCount = 0;
  function countFiles(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        countFiles(fullPath);
      } else {
        fileCount++;
      }
    });
  }
  countFiles(projectPath);
  
  console.log(chalk.white(`📁 Total files: ${chalk.bold(fileCount)}`));
  console.log(chalk.white(`📦 Entities: ${chalk.bold(config.entities.length)}`));
  console.log(chalk.white(`🔗 Relationships: ${chalk.bold(config.relationships.length)}`));
  
  if (config.killSwitches.skipFrontend) {
    console.log(chalk.yellow(`⏭️  Frontend: Skipped (backend-only)`));
  }
  if (config.killSwitches.skipBackend) {
    console.log(chalk.yellow(`⏭️  Backend: Skipped (frontend-only)`));
  }
  
  console.log('');
}

function generateQuickStartScripts(projectPath, config) {
  if (config.needsBackend && config.needsFrontend) {
    // start-all.sh for Unix
    const startAll = `#!/bin/bash
echo "🚀 Starting ${config.projectName}..."

# Start backend
cd backend
python -m venv venv 2>/dev/null || true
source venv/bin/activate
pip install -r requirements.txt
python run.py &
BACKEND_PID=$!

# Start frontend
cd ../frontend
npm install
npm run dev &
FRONTEND_PID=$!

echo "✅ Backend running on http://localhost:5555"
echo "✅ Frontend running on http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait
`;

    createFile(path.join(projectPath, 'start-all.sh'), startAll);
    
    // Make executable
    fs.chmodSync(path.join(projectPath, 'start-all.sh'), '755');
    
    console.log(chalk.green('✅ Quick-start script (start-all.sh)'));
  }
}

// Run the CLI
async function run() {
  try {
    // Run the CLI
    const answers = await inquirer.prompt(questions);
    
    if (!answers.confirm) {
      console.log(chalk.red('\n❌ Cancelled\n'));
      return; // Exit function instead of process.exit
    }

    console.log(chalk.green('\n✅ Analyzing requirements...\n'));
    
    // Parse entities
    const entities = answers.entities
      ? answers.entities.split(',').map(e => e.trim()).filter(e => e.length > 0) // Filter out empty strings
      : [];
    
    // Validate entities
    if (entities.length === 0) {
      console.log(chalk.red('\n❌ No valid entities provided\n'));
      return;
    }

    // Ask about relationships if needed
    let relationships = [];
    if (answers.hasRelationships && entities.length > 1) {
      relationships = await askRelationships(entities);
    }
    
    // Smart config with kill switches
    const config = buildSmartConfig(answers, entities, relationships);
    
    // Show what will be generated
    await showGenerationPlan(config); // Ensure this is awaited if async
    
    const proceed = await inquirer.prompt([{
      type: 'confirm',
      name: 'proceed',
      message: 'Proceed with generation?',
      default: true
    }]);
    
    if (!proceed.proceed) {
      console.log(chalk.red('\n❌ Cancelled\n'));
      return; // Exit function instead of process.exit
    } 
    
    // Generate project
    await generateProject(projectPath, config);
    generateQuickStartScripts(projectPath, config);
  } catch (error) {
    console.error(chalk.red('\n❌ Error:'), error.message);
    process.exit(1);
  }
}

async function runUniformityCheck(projectPath, config) {
  console.log(chalk.bold.cyan('\n🔍 Running Uniformity Check...\n'));
  
  // Check if checker exists
  const checkerPath = path.join(import.meta.dirname, '../uniformity-checker/checker.js');
  
  if (!fs.existsSync(checkerPath)) {
    console.log(chalk.yellow('⚠️  Uniformity checker not found - skipping validation'));
    console.log(chalk.gray(`   Install it at: ${path.dirname(checkerPath)}`));
    return;
  }
  
  // Run the checker
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const { stdout } = await execAsync(`node ${checkerPath} ${projectPath}`, {
      cwd: path.dirname(checkerPath)
    });
    
    console.log(stdout);
    console.log(chalk.green('✅ Uniformity check passed!\n'));
  } catch (error) {
    // Checker returns exit code 1 if not 100% uniform
    console.log(error.stdout);
    console.log(chalk.yellow('⚠️  Some uniformity issues detected (this is normal for generated projects)\n'));
  }
}

function generateGitignore(projectPath, config) {
  let gitignore = `# Python
*.pyc
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
venv/
env/
*.egg-info/
dist/
build/

# Database
*.db
*.sqlite
instance/

# Environment
.env
.env.local

`;

  if (config.needsFrontend) {
    gitignore += `# Node
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# Build
dist/
*.local

# Editor
.vscode/
.idea/
*.swp
*.swo
*~

`;
  }

  gitignore += `# OS
.DS_Store
Thumbs.db

# Uniformity Checker
uniformity-results.json
`;

  createFile(path.join(projectPath, '.gitignore'), gitignore);
  console.log(chalk.green('✅ .gitignore created'));
}

function generateProjectMetadata(projectPath, config) {
  const metadata = {
    name: config.projectName,
    type: config.projectType,
    generated: new Date().toISOString(),
    generator: 'uniform-build v1.0.0',
    entities: config.entities,
    relationships: config.relationships,
    features: config.features,
    killSwitches: config.killSwitches,
    stats: {
      totalFiles: 0,  // TODO: count files
      linesOfCode: 0   // TODO: count lines
    }
  };
  
  createFile(
    path.join(projectPath, '.uniform-project.json'), 
    JSON.stringify(metadata, null, 2)
  );
  
  console.log(chalk.green('✅ Project metadata saved'));
}

async function generateProject(config) {
    
  const projectPath = path.join(process.cwd(), config.projectName);
  
  // Create project folder
  if (fs.existsSync(projectPath)) {
    console.log(chalk.red(`❌ Folder ${config.projectName} already exists!`));
    process.exit(1);
  }
  
  fs.mkdirSync(projectPath);
    await showProgress('Creating project structure', 500);
  console.log(chalk.green(`✅ Created ${config.projectName}/`));
  //generate metadata
  generateProjectMetadata(projectPath, config);
  
  // Generate backend
  if (config.needsBackend) {
    await showProgress('Generating backend', 1000);
    await generateBackend(projectPath, config);
  } else {
    console.log(chalk.yellow('⏭️  Skipping backend (frontend-only)'));
  }
  
  // Generate frontend
  if (config.needsFrontend) {
    await showProgress('Generating frontend', 1000);
    await generateFrontend(projectPath, config);
  }else {
    console.log(chalk.yellow('⏭️  Skipping frontend (backend-only)'));
  }
  
  // Generate README
  generateReadme(projectPath, config);

  // Generate .gitignore
  generateGitignore(projectPath, config);
  
  console.log(chalk.bold.green('\n🎉 PROJECT GENERATED!\n'));
  console.log(chalk.cyan('Next steps:'));
  console.log(chalk.white(`  cd ${config.projectName}`));
  if (config.needsBackend && config.needsFrontend) {
    console.log(chalk.white(`  # Terminal 1: cd backend && python run.py`));
    console.log(chalk.white(`  # Terminal 2: cd frontend && npm install && npm run dev`));
  } else if (config.needsBackend) {
    console.log(chalk.white(`  cd backend && python run.py`));
  } else {
    console.log(chalk.white(`  cd frontend && npm install && npm run dev`));
  }
  console.log(chalk.bold.green('\n🎉 PROJECT GENERATED!\n'));
  
  // NEW: Auto-run uniformity checker
  await runUniformityCheck(projectPath, config);
  
  // Show next steps
  showNextSteps(config);
}

function showNextSteps(config) {
  console.log(chalk.bold.cyan('📚 Next Steps:\n'));
  
  console.log(chalk.white(`1️⃣  Navigate to your project:`));
  console.log(chalk.gray(`   cd ${config.projectName}\n`));
  
  if (config.needsBackend) {
    console.log(chalk.white(`2️⃣  Setup backend:`));
    console.log(chalk.gray(`   cd backend`));
    console.log(chalk.gray(`   python -m venv venv`));
    console.log(chalk.gray(`   source venv/bin/activate  # On Windows: venv\\Scripts\\activate`));
    console.log(chalk.gray(`   pip install -r requirements.txt`));
    console.log(chalk.gray(`   python run.py\n`));
  }
  
  if (config.needsFrontend) {
    const step = config.needsBackend ? '3️⃣' : '2️⃣';
    console.log(chalk.white(`${step}  Setup frontend:`));
    console.log(chalk.gray(`   cd frontend`));
    console.log(chalk.gray(`   npm install`));
    console.log(chalk.gray(`   npm run dev\n`));
  }
  
  if (config.needsBackend && config.needsFrontend) {
    console.log(chalk.white(`4️⃣  Access your app:`));
    console.log(chalk.gray(`   Frontend: http://localhost:3000`));
    console.log(chalk.gray(`   Backend:  http://localhost:5555`));
    console.log(chalk.gray(`   Health:   http://localhost:5555/api/health\n`));
  }
  
  console.log(chalk.white(`🔧 Validate uniformity anytime:`));
  console.log(chalk.gray(`   cd ../uniformity-checker`));
  console.log(chalk.gray(`   npm run check ../${config.projectName}\n`));
  
  console.log(chalk.bold.green('Happy coding! 🚀\n'));
}

async function generateBackend(projectPath, config) {
  console.log(chalk.cyan('📦 Generating backend...'));
  
  const backendPath = path.join(projectPath, 'backend');
  fs.mkdirSync(backendPath);
  fs.mkdirSync(path.join(backendPath, 'app'));
  fs.mkdirSync(path.join(backendPath, 'instance'));
  
  // Core files (always needed)
  createFile(path.join(backendPath, 'app', '__init__.py'), generateAppInit(config));
  createFile(path.join(backendPath, 'app', 'extensions.py'), generateExtensions());
  createFile(path.join(backendPath, 'run.py'), generateRunPy(config));
  createFile(path.join(backendPath, 'config.py'), generateConfigPy());
  createFile(path.join(backendPath, 'requirements.txt'), generateRequirements(config));
  createFile(path.join(backendPath, '.env.example'), generateEnvExample());
  
  // Entity-specific files (skip if no entities)
  if (config.entities.length > 0) {
    createFile(path.join(backendPath, 'app', 'models.py'), generateModels(config));
    createFile(path.join(backendPath, 'app', 'schemas.py'), generateSchemas(config));
    createFile(path.join(backendPath, 'app', 'routes.py'), generateRoutes(config));
    console.log(chalk.green(`  ✅ Generated ${config.entities.length} models`));
  } else {
    console.log(chalk.yellow('  ⏭️  Skipped models (no entities)'));
  }
  
  // API Documentation (if needed)
  if (config.backend.needsApiDocs) {
    createFile(path.join(backendPath, 'app', 'docs.py'), generateApiDocs(config));
    console.log(chalk.green('  ✅ API documentation'));
  }
  
  // Versioning (if needed)
  if (config.backend.needsVersioning) {
    createFile(path.join(backendPath, 'app', 'versioning.py'), generateVersioning());
    console.log(chalk.green('  ✅ API versioning'));
  }
  
  console.log(chalk.green('✅ Backend generated'));
}

async function generateFrontend(projectPath, config) {
  console.log(chalk.cyan('⚛️  Generating frontend...'));
  
  const frontendPath = path.join(projectPath, 'frontend');
  fs.mkdirSync(frontendPath);
  
  // Core folder structure (always needed)
  const folders = [
    'src',
    'src/components/common',
    'src/components/layout',
    'src/pages',
    'public'
  ];
  
  // Conditional folders based on kill switches
  if (!config.killSwitches.skipApiService) {
    folders.push('src/services');
  }
  
  if (!config.killSwitches.skipProviders) {
    folders.push('src/contexts', 'src/providers', 'src/hooks');
  }
  
  if (config.entities.length > 0) {
    folders.push('src/components/features');
  }
  
  folders.forEach(folder => {
    fs.mkdirSync(path.join(frontendPath, folder), { recursive: true });
  });
  
  // Core files (always needed)
  createFile(path.join(frontendPath, 'package.json'), generatePackageJson(config));
  createFile(path.join(frontendPath, 'vite.config.js'), generateViteConfig());
  createFile(path.join(frontendPath, 'index.html'), generateIndexHtml(config));
  createFile(path.join(frontendPath, 'src', 'main.jsx'), generateMainJsx());
  
  // App.jsx (conditional based on what's needed)
  if (config.frontend.isStatic) {
    createFile(path.join(frontendPath, 'src', 'App.jsx'), generateStaticAppJsx(config));
    console.log(chalk.yellow('  ⏭️  Generated static app (no backend needed)'));
  } else {
    createFile(path.join(frontendPath, 'src', 'App.jsx'), generateAppJsx(config));
  }
  
  // API Service (skip if static site)
  if (!config.killSwitches.skipApiService) {
    createFile(path.join(frontendPath, 'src', 'services', 'api.js'), generateApiService(config));
    console.log(chalk.green('  ✅ API service layer'));
  } else {
    console.log(chalk.yellow('  ⏭️  Skipped API service (static site)'));
  }
  
  // Components (always generate common components)
  generateCommonComponents(frontendPath);
  generateLayoutComponents(frontendPath, config);
  
  // Entity-specific files (skip if no backend or no entities)
  if (!config.killSwitches.skipProviders && config.entities.length > 0) {
    config.entities.forEach(entity => {
      generateEntityFiles(frontendPath, entity, config);
    });
    console.log(chalk.green(`  ✅ Generated ${config.entities.length} entity components`));
  } else {
    console.log(chalk.yellow('  ⏭️  Skipped entity components (no backend integration)'));
  }
  
  console.log(chalk.green('✅ Frontend generated'));
}

function generateReadme(projectPath, config) {
  const readme = `# ${config.projectName}

> Generated with **Uniform Build** on ${new Date().toLocaleDateString()}

## 🏗️ Project Structure

\`\`\`
${config.projectName}/
${config.needsBackend ? '├── backend/          # Flask API\n' : ''}${config.needsFrontend ? '├── frontend/         # React app\n' : ''}├── .gitignore
├── .uniform-project.json
└── README.md
\`\`\`

## 📦 Tech Stack

${config.needsBackend ? '**Backend:** Flask, SQLAlchemy, Marshmallow\n' : ''}${config.needsFrontend ? '**Frontend:** React, Vite, Axios\n' : ''}
## 🗄️ Data Model

${config.entities.length > 0 ? `
### Entities
${config.entities.map(e => `- **${e}**`).join('\n')}

### Relationships
${config.relationships.length > 0 ? config.relationships.map(r => {
  if (r.type === 'entity1-to-entity2') return `- ${r.entity1} → ${r.entity2} (many-to-one)`;
  if (r.type === 'entity2-to-entity1') return `- ${r.entity2} → ${r.entity1} (many-to-one)`;
  if (r.type === 'many-to-many') return `- ${r.entity1} ↔ ${r.entity2} (many-to-many)`;
}).join('\n') : '_No relationships defined_'}
` : '_No entities defined_'}

## 🚀 Quick Start

${config.needsBackend && config.needsFrontend ? `
### Option 1: Quick start (Unix/Mac)
\`\`\`bash
./start-all.sh
\`\`\`
` : ''}

### ${config.needsBackend && config.needsFrontend ? 'Option 2: ' : ''}Manual Setup

${config.needsBackend ? `
#### Backend
\`\`\`bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\\Scripts\\activate
pip install -r requirements.txt
python run.py
\`\`\`

Backend runs on: \`http://localhost:5555\`
` : ''}

${config.needsFrontend ? `
#### Frontend
\`\`\`bash
cd frontend
npm install
npm run dev
\`\`\`

Frontend runs on: \`http://localhost:3000\`
` : ''}

## 📚 API Endpoints

${config.entities.map(e => {
  const lower = e.toLowerCase();
  const plural = lower + 's';
  return `
### ${e}
- \`GET    /api/${plural}\` - List all
- \`GET    /api/${plural}/:id\` - Get one
- \`POST   /api/${plural}\` - Create
- \`PUT    /api/${plural}/:id\` - Update
- \`DELETE /api/${plural}/:id\` - Delete
`;
}).join('')}

${config.entities.length === 0 ? '_No API endpoints (no entities defined)_' : ''}

## 🔧 Development

### Check Uniformity
\`\`\`bash
cd ../uniformity-checker
npm run check ../${config.projectName}
\`\`\`

### Database Migrations
\`\`\`bash
cd backend
flask db init
flask db migrate -m "Initial migration"
flask db upgrade
\`\`\`

## ✨ Features

${config.features.length > 0 ? config.features.map(f => `- ${f}`).join('\n') : '_No additional features_'}

## 🎯 What Was Generated

- ✅ ${config.needsBackend ? 'Backend with ' + config.entities.length + ' models' : 'No backend'}
- ✅ ${config.needsFrontend ? 'Frontend with React + Vite' : 'No frontend'}
- ✅ ${config.relationships.length} relationship(s)
- ✅ Complete CRUD operations
- ✅ API service layer
- ✅ Context providers
- ✅ Reusable components

---

**Built with ❤️ using Uniform Build**

Run \`uniform-check\` to validate your code stays uniform!
`;
  
  createFile(path.join(projectPath, 'README.md'), readme);
  console.log(chalk.green('✅ README.md created'));
}

// Helper function to create files
function createFile(filePath, content) {
  fs.writeFileSync(filePath, content);
}

// Template generators (we'll build these next)
function generateAppInit(config) {
  return `from flask import Flask
from flask_cors import CORS
from .extensions import db, migrate, ma
from .routes import api_bp

def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = 'dev-secret-key'
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///app.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    CORS(app)
    db.init_app(app)
    migrate.init_app(app, db)
    ma.init_app(app)
    
    app.register_blueprint(api_bp, url_prefix='/api')
    
    return app
`;
}

function generateExtensions() {
  return `from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_marshmallow import Marshmallow

db = SQLAlchemy()
migrate = Migrate()
ma = Marshmallow()
`;
}

function generateStaticAppJsx(config) {
  return `function App() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>${config.projectName}</h1>
      <p>Static React application - no backend needed!</p>
      <p>Add your components and pages here.</p>
    </div>
  )
}

export default App
`;
}

function generateApiDocs(config) {
  return `# API Documentation Generator
# TODO: Implement Swagger/OpenAPI docs
# For now, endpoints are documented in routes.py
`;
}

function generateVersioning() {
  return `# API Versioning
# All routes will be prefixed with /api/v1/
# Future: /api/v2/ for breaking changes
`;
}

function processRelationships(entities, relationships) {
  const entityRels = {};
  entities.forEach(e => { entityRels[e] = []; });
  
  relationships.forEach(rel => {
    const { entity1, entity2, type } = rel;
    
    if (type === 'entity1-to-entity2') {
      // entity1 belongs to entity2 (entity1 has foreign key)
      // entity1: many-to-one (has FK)
      entityRels[entity1].push({
        type: 'many-to-one',
        target: entity2,
        relationshipName: entity2.toLowerCase(),
        backPopulates: entity1.toLowerCase() + 's'
      });
      
      // entity2: one-to-many (referenced by FK)
      entityRels[entity2].push({
        type: 'one-to-many',
        target: entity1,
        relationshipName: entity1.toLowerCase() + 's',
        backPopulates: entity2.toLowerCase()
      });
    }
    else if (type === 'entity2-to-entity1') {
      // entity2 belongs to entity1 (entity2 has foreign key)
      entityRels[entity2].push({
        type: 'many-to-one',
        target: entity1,
        relationshipName: entity1.toLowerCase(),
        backPopulates: entity2.toLowerCase() + 's'
      });
      
      entityRels[entity1].push({
        type: 'one-to-many',
        target: entity2,
        relationshipName: entity2.toLowerCase() + 's',
        backPopulates: entity1.toLowerCase()
      });
    }
    else if (type === 'many-to-many') {
      // Both entities get many-to-many relationships
      entityRels[entity1].push({
        type: 'many-to-many',
        target: entity2,
        relationshipName: entity2.toLowerCase() + 's',
        backPopulates: entity1.toLowerCase() + 's'
      });
      
      entityRels[entity2].push({
        type: 'many-to-many',
        target: entity1,
        relationshipName: entity1.toLowerCase() + 's',
        backPopulates: entity2.toLowerCase() + 's'
      });
    }
  });
  
  return entityRels;
}

function generateModels(config) {
  if (!config.entities.length) return '# No models\n';
  
  let code = `from .extensions import db
from datetime import datetime, timezone\n\n`;
  
  // Process relationships to know what foreign keys each entity needs
  const entityRelationships = processRelationships(config.entities, config.relationships);
  
  config.entities.forEach(entity => {
    const tableName = entity.toLowerCase() + 's';
    const rels = entityRelationships[entity] || [];
    
    code += `class ${entity}(db.Model):
    __tablename__ = '${tableName}'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
`;

    // Add foreign keys for many-to-one relationships
    rels.forEach(rel => {
      if (rel.type === 'many-to-one') {
        const fkName = rel.target.toLowerCase() + '_id';
        const fkTable = rel.target.toLowerCase() + 's';
        code += `    ${fkName} = db.Column(db.Integer, db.ForeignKey('${fkTable}.id'), nullable=False)\n`;
      }
    });

    code += `    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
`;

    // Add relationships
    if (rels.length > 0) {
      code += `\n    # Relationships\n`;
      rels.forEach(rel => {
        const relName = rel.relationshipName;
        const backPop = rel.backPopulates;
        
        code += `    ${relName} = db.relationship('${rel.target}', back_populates='${backPop}'`;
        
        if (rel.type === 'one-to-many') {
          code += `, cascade='all, delete-orphan'`;
        }
        
        code += `)\n`;
      });
    }

    code += `
    def __repr__(self):
        return f'<${entity} {self.name}>'

`;
  });
  
  return code;
}

function generateSchemas(config) {
  if (!config.entities.length) return '# No schemas\n';
  
  const entityRelationships = processRelationships(config.entities, config.relationships);
  
  let code = `from .extensions import ma
from .models import ${config.entities.join(', ')}\n\n`;
  
  config.entities.forEach(entity => {
    const lower = entity.toLowerCase();
    const rels = entityRelationships[entity] || [];
    
    code += `class ${entity}Schema(ma.SQLAlchemyAutoSchema):
`;

    // Add nested relationships
    if (rels.length > 0) {
      rels.forEach(rel => {
        const isMany = rel.type !== 'many-to-one';
        code += `    ${rel.relationshipName} = ma.Nested('${rel.target}Schema', many=${isMany}, exclude=('${rel.backPopulates}',))\n`;
      });
      code += '\n';
    }

    code += `    class Meta:
        model = ${entity}
        load_instance = True
        include_fk = True

${lower}_schema = ${entity}Schema()
${lower}s_schema = ${entity}Schema(many=True)

`;
  });
  
  return code;
}

function generateRoutes(config) {
  if (!config.entities.length) return '# No routes\n';
  
  const entityRelationships = processRelationships(config.entities, config.relationships);
  
  let code = `from flask import Blueprint, request, jsonify
from .extensions import db
from .models import ${config.entities.join(', ')}
from .schemas import ${config.entities.map(e => `${e.toLowerCase()}_schema, ${e.toLowerCase()}s_schema`).join(', ')}

api_bp = Blueprint('api', __name__)

`;
  
  config.entities.forEach(entity => {
    const lower = entity.toLowerCase();
    const plural = `${lower}s`;
    const rels = entityRelationships[entity] || [];
    
    // Determine required fields (foreign keys from many-to-one relationships)
    const requiredFields = ['name'];
    rels.forEach(rel => {
      if (rel.type === 'many-to-one') {
        requiredFields.push(rel.target.toLowerCase() + '_id');
      }
    });
    
    code += `# ${entity.toUpperCase()} ROUTES
@api_bp.route('/${plural}', methods=['GET'])
def get_${plural}():
    items = ${entity}.query.all()
    return jsonify(${plural}_schema.dump(items))

@api_bp.route('/${plural}/<int:id>', methods=['GET'])
def get_${lower}(id):
    item = ${entity}.query.get_or_404(id)
    return jsonify(${lower}_schema.dump(item))

@api_bp.route('/${plural}', methods=['POST'])
def create_${lower}():
    data = request.get_json()
    required = ${JSON.stringify(requiredFields)}
    for field in required:
        if field not in data:
            return jsonify({'error': f'Missing: {field}'}), 400
    item = ${entity}(**data)
    db.session.add(item)
    db.session.commit()
    return jsonify(${lower}_schema.dump(item)), 201

@api_bp.route('/${plural}/<int:id>', methods=['PUT'])
def update_${lower}(id):
    item = ${entity}.query.get_or_404(id)
    data = request.get_json()
    for key, value in data.items():
        setattr(item, key, value)
    db.session.commit()
    return jsonify(${lower}_schema.dump(item))

@api_bp.route('/${plural}/<int:id>', methods=['DELETE'])
def delete_${lower}(id):
    item = ${entity}.query.get_or_404(id)
    db.session.delete(item)
    db.session.commit()
    return '', 204

`;
  });
  
  code += `@api_bp.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy'})
`;
  
  return code;
}

function generateRunPy(config) {
  return `from app import create_app
from app.extensions import db

app = create_app()

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True, port=5555)
`;
}

function generateConfigPy() {
  return `import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key'
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///app.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
`;
}

function generateRequirements(config) {
  return `Flask==3.0.0
Flask-SQLAlchemy==3.1.1
Flask-Migrate==4.0.5
Flask-Marshmallow==0.15.0
marshmallow-sqlalchemy==0.29.0
Flask-CORS==4.0.0
python-dotenv==1.0.0
`;
}

function generateEnvExample() {
  return `SECRET_KEY=your-secret-key-here
DATABASE_URL=sqlite:///app.db
`;
}

function generatePackageJson(config) {
  return JSON.stringify({
    name: config.projectName,
    version: '1.0.0',
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview'
    },
    dependencies: {
      react: '^18.2.0',
      'react-dom': '^18.2.0',
      'react-router-dom': '^6.20.0',
      axios: '^1.6.2'
    },
    devDependencies: {
      '@vitejs/plugin-react': '^4.2.1',
      vite: '^5.0.8'
    }
  }, null, 2);
}

function generateViteConfig() {
  return `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000
  }
})
`;
}

function generateIndexHtml(config) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${config.projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`;
}

function generateMainJsx() {
  return `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`;
}

function generateAppJsx(config) {
  if (!config.needsBackend || !config.entities.length) {
    return `function App() {
  return (
    <div>
      <h1>${config.projectName}</h1>
      <p>Your app starts here!</p>
    </div>
  )
}

export default App
`;
  }
  
  const providers = config.entities.map(e => `${e}Provider`).join(', ');
  const imports = config.entities.map(e => 
    `import { ${e}Provider } from './providers/${e}Provider'`
  ).join('\n');
  
  let jsx = `import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
${imports}
import HomePage from './pages/HomePage'
${config.entities.map(e => `import ${e}Page from './pages/${e}Page'`).join('\n')}

function App() {
  return (
    ${config.entities.map(e => `<${e}Provider>`).join('\n    ')}
      <Router>
        <nav style={{ padding: '1rem', background: '#f0f0f0' }}>
          <Link to="/" style={{ marginRight: '1rem' }}>Home</Link>
          ${config.entities.map(e => `<Link to="/${e.toLowerCase()}s" style={{ marginRight: '1rem' }}>${e}s</Link>`).join('\n          ')}
        </nav>
        
        <Routes>
          <Route path="/" element={<HomePage />} />
          ${config.entities.map(e => `<Route path="/${e.toLowerCase()}s" element={<${e}Page />} />`).join('\n          ')}
        </Routes>
      </Router>
    ${config.entities.map(e => `</${e}Provider>`).reverse().join('\n    ')}
  )
}

export default App
`;
  
  return jsx;
}

function generateApiService(config) {
  if (!config.entities.length) {
    return `import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5555/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;
`;
  }
  
  let code = `import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5555/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

`;
  
  config.entities.forEach(entity => {
    const lower = entity.toLowerCase();
    const plural = `${lower}s`;
    const capitalized = entity.charAt(0).toUpperCase() + entity.slice(1);
    
    code += `// ${capitalized} API
export const get${capitalized}s = () => api.get('/${plural}');
export const get${capitalized} = (id) => api.get(\`/${plural}/\${id}\`);
export const create${capitalized} = (data) => api.post('/${plural}', data);
export const update${capitalized} = (id, data) => api.put(\`/${plural}/\${id}\`, data);
export const delete${capitalized} = (id) => api.delete(\`/${plural}/\${id}\`);

`;
  });
  
  code += `export default api;\n`;
  return code;
}

function generateCommonComponents(frontendPath) {
  // Button
  createFile(path.join(frontendPath, 'src/components/common/Button.jsx'), 
`export default function Button({ children, onClick, variant = 'primary', disabled = false }) {
  const styles = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-800',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
  };
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={\`px-4 py-2 rounded font-semibold \${styles[variant]} disabled:opacity-50\`}
    >
      {children}
    </button>
  );
}
`);

  // Card
  createFile(path.join(frontendPath, 'src/components/common/Card.jsx'),
`export default function Card({ children, title }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      {title && <h3 className="text-xl font-bold mb-4">{title}</h3>}
      {children}
    </div>
  );
}
`);

  // Loading
  createFile(path.join(frontendPath, 'src/components/common/Loading.jsx'),
`export default function Loading() {
  return (
    <div className="flex justify-center items-center p-8">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );
}
`);

  console.log(chalk.green('  ✅ Common components'));
}

function generateLayoutComponents(frontendPath, config) {
  createFile(path.join(frontendPath, 'src/components/layout/Header.jsx'),
`export default function Header() {
  return (
    <header className="bg-blue-600 text-white p-4">
      <h1 className="text-2xl font-bold">${config.projectName}</h1>
    </header>
  );
}
`);
  
  console.log(chalk.green('  ✅ Layout components'));
}

function generateEntityFiles(frontendPath, entity, config) {
  const lower = entity.toLowerCase();
  const plural = `${lower}s`;
  
  // Provider
  createFile(path.join(frontendPath, 'src/providers', `${entity}Provider.jsx`),
`import { createContext, useState, useEffect, useMemo } from 'react';
import { get${entity}s } from '../services/api';

export const ${entity}Context = createContext();

export function ${entity}Provider({ children }) {
  const [${plural}, set${entity}s] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch${entity}s();
  }, []);

  async function fetch${entity}s() {
    try {
      setLoading(true);
      const response = await get${entity}s();
      set${entity}s(response.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const value = useMemo(() => ({
    ${plural},
    loading,
    error,
    refetch: fetch${entity}s
  }), [${plural}, loading, error]);

  return (
    <${entity}Context.Provider value={value}>
      {children}
    </${entity}Context.Provider>
  );
}
`);

  // Page
  createFile(path.join(frontendPath, 'src/pages', `${entity}Page.jsx`),
`import { useContext } from 'react';
import { ${entity}Context } from '../providers/${entity}Provider';
import Loading from '../components/common/Loading';
import Card from '../components/common/Card';

export default function ${entity}Page() {
  const { ${plural}, loading, error } = useContext(${entity}Context);

  if (loading) return <Loading />;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">${entity}s</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {${plural}.map(${lower} => (
          <Card key={${lower}.id} title={${lower}.name}>
            <p>ID: {${lower}.id}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
`);

  // HomePage
  createFile(path.join(frontendPath, 'src/pages/HomePage.jsx'),
`export default function HomePage() {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-4xl font-bold mb-4">${config.projectName}</h1>
      <p className="text-gray-600">Welcome to your new app!</p>
    </div>
  );
}
`);

  console.log(chalk.green(`  ✅ ${entity} files generated`));
}
function showGenerationPlan(config) {
  console.log(chalk.bold.cyan('\n📋 Generation Plan:\n'));
  
  if (config.needsBackend) {
    console.log(chalk.green('✅ Backend (Flask)'));
    console.log(chalk.gray(`   - ${config.entities.length} models`));
    console.log(chalk.gray(`   - ${config.relationships.length} relationships`));
    if (config.backend.needsApiDocs) {
      console.log(chalk.gray('   - API documentation'));
    }
    if (config.backend.needsVersioning) {
      console.log(chalk.gray('   - API versioning'));
    }
  } else {
    console.log(chalk.yellow('⏭️  Backend (skipped - frontend-only)'));
  }
  
  if (config.needsFrontend) {
    console.log(chalk.green('✅ Frontend (React + Vite)'));
    if (!config.killSwitches.skipApiService) {
      console.log(chalk.gray('   - API service layer'));
    }
    if (!config.killSwitches.skipProviders) {
      console.log(chalk.gray(`   - ${config.entities.length} context providers`));
    }
    console.log(chalk.gray('   - Common components (Button, Card, Loading)'));
    console.log(chalk.gray('   - Layout components (Header)'));
    if (config.frontend.isStatic) {
      console.log(chalk.gray('   - Optimized for static deployment'));
    }
  } else {
    console.log(chalk.yellow('⏭️  Frontend (skipped - backend-only)'));
  }
  
  if (config.features.length > 0) {
    console.log(chalk.green(`✅ Features: ${config.features.join(', ')}`));
  }
  
  console.log('');
}

// Run the CLI
run().catch(console.error);