import dotenv from 'dotenv';
import path from 'path'; // Make sure to import 'path'

const envPath = path.resolve(__dirname, '../../.env'); // Assumes .env is in the project root, two levels up from tests/
dotenv.config({ path: envPath });
