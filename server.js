import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const LESSONS_DIR = path.join(__dirname, 'lessons');
const COMMUNITY_LESSONS_FILE = path.join(LESSONS_DIR, 'community_lessons.json');

// Middleware
app.use(cors());
app.use(express.json());

// Ensure lessons directory exists and initialize community lessons file if needed
async function ensureLessonsDir() {
  try {
    await fs.access(LESSONS_DIR);
  } catch {
    await fs.mkdir(LESSONS_DIR, { recursive: true });
  }
  
  try {
    await fs.access(COMMUNITY_LESSONS_FILE);
  } catch {
    await fs.writeFile(COMMUNITY_LESSONS_FILE, JSON.stringify([]));
  }
}

// Load community lessons
async function loadCommunityLessons() {
  try {
    const content = await fs.readFile(COMMUNITY_LESSONS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error loading community lessons:', error);
    return [];
  }
}

// Save community lessons
async function saveCommunityLessons(lessons) {
  try {
    await fs.writeFile(COMMUNITY_LESSONS_FILE, JSON.stringify(lessons, null, 2));
  } catch (error) {
    console.error('Error saving community lessons:', error);
    throw error;
  }
}

// Save a lesson to a file
app.post('/api/save-lesson', async (req, res) => {
  try {
    await ensureLessonsDir();
    const lesson = req.body;
    const filename = `${lesson.id}.json`;
    const filepath = path.join(LESSONS_DIR, filename);
    await fs.writeFile(filepath, JSON.stringify(lesson, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving lesson:', error);
    res.status(500).json({ error: 'Failed to save lesson' });
  }
});

// Load all lessons from files
app.get('/api/load-lessons', async (req, res) => {
  try {
    await ensureLessonsDir();
    const files = await fs.readdir(LESSONS_DIR);
    const lessons = await Promise.all(
      files
        .filter(file => file.endsWith('.json') && file !== 'community_lessons.json')
        .map(async file => {
          const content = await fs.readFile(path.join(LESSONS_DIR, file), 'utf-8');
          return JSON.parse(content);
        })
    );
    res.json(lessons);
  } catch (error) {
    console.error('Error loading lessons:', error);
    res.status(500).json({ error: 'Failed to load lessons' });
  }
});

// Delete a lesson
app.delete('/api/lesson/:lessonId', async (req, res) => {
  try {
    await ensureLessonsDir();
    const { lessonId } = req.params;
    const filename = `${lessonId}.json`;
    const filepath = path.join(LESSONS_DIR, filename);
    
    // Check if file exists before trying to delete
    try {
      await fs.access(filepath);
    } catch {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    
    await fs.unlink(filepath);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting lesson:', error);
    res.status(500).json({ error: 'Failed to delete lesson' });
  }
});

// Share a lesson to community
app.post('/api/community/share', async (req, res) => {
  try {
    await ensureLessonsDir();
    const { lesson, sharedBy } = req.body;
    
    if (!lesson || !lesson.id || !lesson.name || !lesson.flashcards) {
      return res.status(400).json({ error: 'Invalid lesson data' });
    }

    const communityLessons = await loadCommunityLessons();
    
    // Check if lesson is already shared
    const existingIndex = communityLessons.findIndex(l => l.originalId === lesson.id);
    if (existingIndex !== -1) {
      return res.status(400).json({ error: 'Lesson is already shared' });
    }

    const communityLesson = {
      communityId: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      originalId: lesson.id,
      name: lesson.name,
      flashcards: lesson.flashcards,
      sharedBy: sharedBy || 'Anonymous',
      sharedTimestamp: Date.now()
    };

    communityLessons.push(communityLesson);
    await saveCommunityLessons(communityLessons);
    
    res.json(communityLesson);
  } catch (error) {
    console.error('Error sharing lesson:', error);
    res.status(500).json({ error: 'Failed to share lesson' });
  }
});

// Unshare a lesson from community
app.post('/api/community/unshare', async (req, res) => {
  try {
    const { lessonId } = req.body;
    const communityLessons = await loadCommunityLessons();
    
    const updatedLessons = communityLessons.filter(l => l.originalId !== lessonId);
    
    if (updatedLessons.length === communityLessons.length) {
      return res.status(404).json({ error: 'Shared lesson not found' });
    }

    await saveCommunityLessons(updatedLessons);
    res.json({ success: true });
  } catch (error) {
    console.error('Error unsharing lesson:', error);
    res.status(500).json({ error: 'Failed to unshare lesson' });
  }
});

// Get all community lessons
app.get('/api/community/lessons', async (req, res) => {
  try {
    await ensureLessonsDir();
    const communityLessons = await loadCommunityLessons();
    res.json(communityLessons);
  } catch (error) {
    console.error('Error loading community lessons:', error);
    res.status(500).json({ error: 'Failed to load community lessons' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 