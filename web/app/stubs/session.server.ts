// Stub implementation for session utilities

export const requireUser = async (request: Request) => {
  // In a real implementation, this would verify the user's session
  console.log('[STUB] requireUser called');
  return { id: 'stub-user-id', email: 'user@example.com' };
};
