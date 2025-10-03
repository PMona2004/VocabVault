# VocabVault - Wordle-Style Word Guessing Game

A stunning, contemporary Wordle-style word guessing game with user login, game statistics, and admin dashboard functionality.

## Project Screenshots

Here are some screenshots:
![Login Screenshot](images\signup.png)
![Game Screenshot](images\layout1.png)
![Process Screenshot](images\layout2.png)
![Dashboard Screenshot](images\dashboard.png)

## Features

- **User Authentication**: Email and password sign up/login
- **Daily Game Limits**: 3 games per day per user
- **Statistics Tracking**: Win percentages, game history, and performance statistics
- **Admin Dashboard**: User management, word management, and analytics
- **Gorgeous UI**: Sleek modern gradient design (with my fav colors) with slick animations
- **Responsive**: Works on desktop and mobile
- **Row Level Security**: Secure access to data with Supabase RLS

## Tech Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Supabase (Auth + PostgreSQL)
- **Styling**: CSS Grid, Flexbox, CSS Animations
- **Authentication**: Supabase Auth
- **Database**: PostgreSQL with Row Level Security

## Login eg

- testuser@example.com / Test123!

## Setup Instructions

### 1. Clone the Repository

git clone https://github.com/yourusername/vocabvault.git
cd vocabvault

### 2. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Navigate to Settings → API and copy your Project URL and anon public key
3. Execute the SQL schema from `database-schema.sql` in your Supabase SQL Editor

### 3. Configure Environment

1. Open `app.js` and substitute the placeholder values:

const SUPABASE_URL = "your-supabase-project-url";
const SUPABASE_ANON_KEY = "your-supabase-anon-key";

### 4. Run the Application

Just open `index.html` in your web browser, or serve it on a local web server:

#with Python
python -m http.server 8000

## Game Rules

1. **Objective**: Guess the 5-letter word in 6 attempts or fewer
2. **Color Coding**:
   - **Green**: Correct letter in correct place
   - **Yellow**: Correct letter in incorrect place
   - **Gray**: Letter not in the word
3. **Daily Limit**: 3 games per day for each user
4. **Statistics**: Your win rate and game history

## Admin Features

Admin users have access to extra features:

- **User Management**: Display all users and their statistics
- **Word Management**: Add new 5-letter words to the game
- **Analytics Dashboard**: Daily and user reports
- **Game Statistics**: Platform-wide metrics

## Database Schema

The app uses PostgreSQL with the tables:

- `profiles` - User profiles
- `words` - Pre-loaded 5-letter words
- `game_sessions` - Single game records
- `admin_stats` - Platform statistics

All tables apply Row Level Security (RLS) for safe data access.

## Security Features

- **Authentication**: Safe email/password authentication through Supabase Auth
- **Row Level Security**: Database-level security to ensure users can only view their own data
- **Input Validation**:validation on all inputs
- **Rate Limiting**: Daily game quotas to avoid abuse

## UI/UX Features

- **Smooth Animations**
- **Responsive Design**
- **Modern Aesthetics**
- **keyboard navigation**

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License
