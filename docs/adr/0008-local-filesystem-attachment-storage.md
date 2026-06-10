# 8. Local Filesystem Attachment Storage with Abstract Service Layer

We decided to store uploaded attachments on the local server filesystem for the MVP, and register their metadata in the PostgreSQL database, while abstracting the storage operations via an interface to allow clean future migration to cloud object storage.

## Context

The application needs to handle attachments uploaded by both Requesters and Setup File Owners. In production systems, cloud object storage (like AWS S3) is the standard to ensure scalability and high availability. However, integrating cloud storage in the initial development phase requires managing cloud credentials, networking permissions, and provisioning resources, which increases complexity and makes local development harder.

## Decision

We chose to use Local Server Directory storage for the MVP:
- **Filesystem Storage**: Uploaded files will be stored in a designated local directory on the server (e.g., `/uploads/attachments`), outside the active code workspace, with file paths configured in environment variables.
- **Unique Naming**: Files will be renamed upon upload using a unique identifier (UUID/timestamp) to avoid collisions, while retaining their original filenames in database records.
- **Database Metadata**: We will record file metadata (original filename, unique filename, path, size, MIME type, creator, and upload timestamp) in the database to manage downloads and deletions.
- **Abstract Service Interface**: A clean `AttachmentService` interface will handle all upload, read, and delete operations. This abstracts the underlying storage mechanism (filesystem vs. cloud bucket).
- **Migration Path**: If the system scales and is deployed across multiple instances, the `AttachmentService` can be updated to store files on AWS S3 or MinIO without modifying the request workflow controllers or the database structure.
