const API_URL = process.env.NODE_ENV === 'production' 
  ? 'https://your-backend-url.com'  // Replace with your actual backend URL when deployed
  : 'http://localhost:3001';

export const generateResponse = async (prompt: string): Promise<string> => {
  try {
    const response = await fetch(`${API_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      throw new Error('Failed to generate response');
    }

    const data = await response.json();
    return data.response;
  } catch (error) {
    console.error('Error generating response:', error);
    throw error;
  }
}; 