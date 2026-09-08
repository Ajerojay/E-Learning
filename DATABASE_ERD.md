# E-Learning System - Entity Relationship Diagram

```mermaid
erDiagram
    PARENTS_ACCOUNTS ||--o{ CHILDREN_ACCOUNTS : "has"
    LEARNING_CATEGORIES ||--o{ LEARNING_GAMES : "contains"
    CHILDREN_ACCOUNTS ||--o{ VIDEO_LESSONS : "accesses"
    LEARNING_GAMES ||--o{ GAME_ATTEMPTS : "tracked_by"
    CHILDREN_ACCOUNTS ||--o{ GAME_ATTEMPTS : "plays"

    PARENTS_ACCOUNTS {
        string id PK
        string username UK
        string password
        timestamp created_at
        timestamp updated_at
    }

    CHILDREN_ACCOUNTS {
        string id PK
        string parent_id FK
        string child_name
        string first_name
        string last_name
        date date_of_birth
        string grade_level
        string pin_code UK
        string nickname
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }

    LEARNING_CATEGORIES {
        string id PK
        string code UK
        string category_label
        string description
        timestamp created_at
    }

    LEARNING_GAMES {
        string id PK
        string category_id FK
        string game_code UK
        string game_title
        string description
        timestamp created_at
        timestamp updated_at
    }

    VIDEO_LESSONS {
        string id PK
        string category_code FK
        string title
        string description
        string video_url
        string thumbnail_url
        int duration_seconds
        timestamp created_at
        timestamp updated_at
    }

    GAME_ATTEMPTS {
        string id PK
        string child_id FK
        string game_code FK
        int score
        int wrong_attempts
        boolean finished
        timestamp created_at
        timestamp updated_at
    }
```

## System Overview

### Core Entities

**1. Parents_Accounts**
- Manages parent/guardian login credentials
- Each parent can have multiple children
- Stores username and password for authentication

**2. Children_Accounts**
- Student/child profile information
- Linked to a parent
- Contains PIN for student device access
- Tracks grade level and basic demographics

**3. Learning_Categories**
- Subject categories: Colors, Shapes, Letters, Numbers, Phonics, Logic
- Organizes learning content into themes

**4. Learning_Games**
- Individual games within each category
- Each game belongs to one category
- Represents specific learning activities

**5. Video_Lessons**
- Instructional video content
- Associated with learning categories
- Contains metadata (URL, duration, thumbnail)

**6. Game_Attempts** (Tracked through views)
- Records child's performance in games
- Captures score, attempts, and completion status
- Enables progress tracking

### Key Relationships

- **Parent → Children**: One-to-Many (1 parent manages multiple children)
- **Category → Games**: One-to-Many (1 category contains multiple games)
- **Child → Game Attempts**: One-to-Many (1 child plays multiple games)
- **Child → Video Lessons**: Many-to-Many (children access various lessons)

### Data Views (for Analytics/Progress)

- `v_child_overall_progress`: Aggregated progress percentage per child
- `v_child_category_progress`: Progress breakdown by category
- `v_child_recent_activity`: Recent game attempts and performance

### Security Features

- Parent accounts use username/password authentication
- Student access via PIN code (4-digit)
- Active status flag for child accounts
