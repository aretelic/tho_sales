import { google } from 'googleapis';
import { getOAuth2Client } from './googleClient.js';

export async function listDriveFiles(userId) {
  const auth = getOAuth2Client(userId);
  const drive = google.drive({ version: 'v3', auth });
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!folderId) {
    throw new Error('GOOGLE_DRIVE_FOLDER_ID is not configured in .env');
  }

  const docTypes = [
    'application/vnd.google-apps.document',                                  // Google Docs
    'text/plain',                                                             // .txt
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword',                                                     // .doc
  ];
  const mimeFilter = docTypes.map(t => `mimeType = '${t}'`).join(' or ');

  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false and (${mimeFilter})`,
    fields: 'files(id, name, mimeType, modifiedTime, size)',
    orderBy: 'modifiedTime desc',
    pageSize: 100,
  });

  return response.data.files || [];
}

export async function getDriveFileContent(userId, fileId, mimeType) {
  const auth = getOAuth2Client(userId);
  const drive = google.drive({ version: 'v3', auth });

  if (mimeType === 'application/vnd.google-apps.document') {
    // Export Google Docs as plain text
    const response = await drive.files.export(
      { fileId, mimeType: 'text/plain' },
      { responseType: 'text' },
    );
    return response.data;
  }

  // Download plain text / Word docs / etc.
  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'text' },
  );
  return response.data;
}
