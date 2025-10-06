# Requirements Document

## Introduction

Youtubera is a premium YouTube-to-course conversion platform that transforms YouTube playlists and videos into structured learning experiences. The platform processes full YouTube videos into digestible short videos, supports both AI-generated and chapter-based content division, includes comprehensive progress tracking, social features, and provides certificates upon completion. The platform aims to reduce distractions and increase engagement while maintaining a premium user experience.

## Requirements

### Requirement 1: Multi-Format Content Processing

**User Story:** As a learner, I want to convert YouTube playlists, individual videos, uploaded videos, or PDF textbooks into structured courses, so that I can learn from various content types in a more organized and distraction-free environment.

#### Acceptance Criteria

1. WHEN a user enters a YouTube playlist URL THEN the system SHALL fetch all videos from the playlist and create a course structure
2. WHEN a user enters a single YouTube video URL THEN the system SHALL create a single-video course
3. WHEN a user uploads a video file THEN the system SHALL process it similarly to YouTube videos
4. WHEN a user uploads a PDF file or provides a PDF URL THEN the system SHALL create a text-based course structure
5. WHEN processing videos THEN the system SHALL create short video segments from each original video
6. WHEN processing PDFs THEN the system SHALL create text sections from each chapter/topic
7. IF a YouTube video has existing chapters with timestamps THEN the system SHALL provide an option to divide the video using those timestamps
8. WHEN a user selects chapter-based processing THEN the system SHALL use YouTube's timestamp data to create short videos
9. WHEN a user selects AI-based processing THEN the system SHALL use AI to intelligently segment the content
10. WHEN a user selects custom processing THEN the system SHALL allow users to specify what they want to learn and generate relevant segments
11. WHEN processing is complete THEN the system SHALL organize content segments into sections corresponding to original sources
12. WHEN short videos are created THEN the system SHALL provide downloadable versions of each segment

### Requirement 2: Content Player and Progress Tracking

**User Story:** As a learner, I want to track my progress through courses in real-time and resume where I left off, so that I can maintain consistent learning momentum across different content types.

#### Acceptance Criteria

1. WHEN a short video is completed THEN the system SHALL display a "Mark as Completed" button next to the video player
2. WHEN a text section is read THEN the system SHALL display a "Mark as Completed" button next to the text content
3. WHEN a user marks content as completed THEN the system SHALL update progress tracking immediately
4. WHEN a user leaves a short video incomplete THEN the system SHALL save the exact playback position
5. WHEN a user leaves a text section incomplete THEN the system SHALL save the reading progress percentage
6. WHEN a user returns to incomplete content THEN the system SHALL resume from the saved position
7. WHEN multiple processing paths exist (AI, chapter-based, custom) THEN the system SHALL track progress separately for each path
8. WHEN displaying overall course progress THEN the system SHALL show the path with higher completion percentage as the main progress
9. WHEN a short video is completed and autoplay is enabled THEN the system SHALL automatically start the next content item
10. WHEN a user requests to download a short video THEN the system SHALL provide a downloadable link

### Requirement 3: Content Enhancement and Exercises

**User Story:** As a learner, I want access to relevant exercises and quizzes for each video segment, so that I can reinforce my learning with practical activities.

#### Acceptance Criteria

1. WHEN displaying a short video THEN the system SHALL show a proper title for the video
2. IF using chapter-based processing THEN the system SHALL use timestamp titles from YouTube
3. IF using AI-based processing THEN the system SHALL generate appropriate titles using AI
4. WHEN a user clicks the exercises button THEN the system SHALL use Gemini API to find relevant free exercises on other websites
5. WHEN a chapter is completed THEN the system SHALL provide links to relevant exercises on free platforms
6. WHEN a chapter is completed THEN the system SHALL offer an optional quiz generated using Gemini API
7. WHEN generating quizzes THEN the system SHALL use the free version of Gemini API

### Requirement 4: User Authentication and Account Management

**User Story:** As a user, I want flexible authentication options including social login, so that I can easily access the platform while maintaining my learning data.

#### Acceptance Criteria

1. WHEN a user visits the platform THEN the system SHALL allow usage without login with limited features
2. WHEN a user chooses to sign up THEN the system SHALL provide options for GitHub, Gmail, and standard account creation
3. WHEN using standard signup THEN the system SHALL require username, email, password, and CAPTCHA verification
4. WHEN a user signs up as a YouTuber/teacher THEN the system SHALL require additional mobile number with OTP verification
5. WHEN a YouTuber signs up THEN the system SHALL send notification email to pancholiansh17@gmail.com
6. WHEN a YouTuber account is verified THEN the system SHALL display an official checkmark after admin approval
7. WHEN a user logs in via GitHub THEN the system SHALL import profile picture and username as defaults

### Requirement 5: Learning Analytics and Gamification

**User Story:** As a learner, I want to track my learning progress through visual analytics and maintain daily streaks, so that I can stay motivated and see my improvement over time.

#### Acceptance Criteria

1. WHEN a user completes learning activities THEN the system SHALL update daily streak counters
2. WHEN a user watches videos, completes exercises, or posts content THEN the system SHALL award appropriate points
3. WHEN displaying user analytics THEN the system SHALL show progress graphs and learning statistics
4. WHEN a user completes a course THEN the system SHALL generate a customized certificate
5. WHEN generating certificates THEN the system SHALL include user name, course/chapter name, YouTuber/channel name, completion date, and Youtubera watermark
6. WHEN displaying user profile THEN the system SHALL show skill tags with percentages based on completed courses
7. WHEN showing profile statistics THEN the system SHALL display longest streak and total active days

### Requirement 6: Social Features and Community

**User Story:** As a user, I want to interact with other learners and YouTubers in a community environment, so that I can discuss course content and build learning connections.

#### Acceptance Criteria

1. WHEN logged-in users access community tab THEN the system SHALL allow interaction with other users taking the same course/chapter
2. WHEN users interact in community THEN the system SHALL use Gemini API to ensure educational content
3. WHEN non-educational content is detected THEN the system SHALL suggest private messaging instead
4. WHEN users follow each other THEN the system SHALL enable private messaging with end-to-end encryption
5. WHEN displaying user profiles THEN the system SHALL show joined date, followers, following, and profile views
6. WHEN users have mutual following THEN the system SHALL enable synchronized video watching with real-time chat
7. WHEN displaying activity THEN the system SHALL show GitHub-like activity bars on profile pages

### Requirement 7: Profile Management and Privacy

**User Story:** As a user, I want to customize my profile and control my privacy settings, so that I can present myself appropriately and manage my online presence.

#### Acceptance Criteria

1. WHEN a user creates a profile THEN the system SHALL provide default profile picture options
2. WHEN a user signs up via GitHub THEN the system SHALL use GitHub profile picture and username as defaults
3. WHEN a user accesses profile settings THEN the system SHALL allow bio addition and profile customization
4. WHEN displaying profiles THEN the system SHALL show user replies from community tab in descending order
5. WHEN a user configures privacy THEN the system SHALL allow public/private profile settings
6. WHEN users interact THEN the system SHALL show hover information with follower/following counts
7. WHEN managing notifications THEN the system SHALL allow email preferences for followed user activities and community interactions

### Requirement 8: System Architecture and Performance

**User Story:** As a platform user, I want fast and reliable video processing and content delivery, so that I can have a smooth learning experience without technical interruptions.

#### Acceptance Criteria

1. WHEN processing videos THEN the system SHALL use Ubuntu server infrastructure for video processing
2. WHEN storing user data THEN the system SHALL use PostgreSQL database for reliable data management
3. WHEN users access the platform THEN the system SHALL provide a premium user experience with fast loading times
4. WHEN handling API requests THEN the system SHALL efficiently manage Gemini API calls for content generation
5. WHEN processing large playlists THEN the system SHALL handle video processing without timeouts
6. WHEN users access content THEN the system SHALL ensure secure and encrypted data transmission
7. WHEN scaling the platform THEN the system SHALL maintain performance across multiple concurrent users