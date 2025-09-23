export function enhanceMetadata({ metadata, file_name, file_mime, file_size }) {
  const enhanced = {
    ...metadata,
    fileName: file_name,
    fileMime: file_mime,
    fileSize: file_size,
    isFile: Boolean(file_name && !(file_mime || '').startsWith('image/'))
  };

  // KONKRET ÆNDRING:
  if (enhanced.email && typeof enhanced.email === 'string') {
    enhanced.email = [enhanced.email]; // konverter string til array
  }

  return enhanced;
}


export function mapDbMessagesToFrontend(rows) {
  return rows.map(row => ({
    text: row.message_text,
    isUser: row.is_user,
    isSystem: row.is_system,
    isForm: row.is_form,
    agentName: row.agent_name,
    profilePicture: row.profile_picture,
    image: row.image_data,
    messageType: row.message_type,
    sequenceNumber: row.sequence_number,
    createdAt: row.created_at,
    metadata: row.metadata,
    fileName: row.metadata?.fileName,
    fileMime: row.metadata?.fileMime,
    fileSize: row.metadata?.fileSize,
    isFile: row.metadata?.isFile || false,
    textWithMarkers: row.text_with_markers || row.message_text,
    isError: row.is_error || false,
    ...((row.metadata && row.metadata.originalProperties) || {})
  }));
}


