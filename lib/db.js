// lib/db.js
import { MongoClient } from 'mongodb';
import { MONGODB_URI } from './config.js';

let client = null;
let db = null;

export async function getDB() {
  if (db) return db;
  client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db('expressvpn');
  return db;
}

export async function getUsersCol() {
  const database = await getDB();
  return database.collection('users');
}
