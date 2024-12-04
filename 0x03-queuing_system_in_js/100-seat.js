#!/usr/bin/env node
import { Queue, Job } from 'kue';
const express = require('express');
const redis = require('redis');
const kue = require('kue');
const { promisify } = require('util');

// Create Redis client
const client = redis.createClient();
const reserveSeat = (number) => client.set('available_seats', number);
const getCurrentAvailableSeats = promisify(client.get).bind(client);

// Initialize variables
let reservationEnabled = true;

// Set initial number of seats
reserveSeat(50);

// Create Kue queue
const queue = kue.createQueue();

// Create Express app
const app = express();
const PORT = 1245;

// Route: GET /available_seats
app.get('/available_seats', async (req, res) => {
  const seats = await getCurrentAvailableSeats();
  res.json({ numberOfAvailableSeats: seats });
});

// Route: GET /reserve_seat
app.get('/reserve_seat', (req, res) => {
  if (!reservationEnabled) {
    return res.json({ status: 'Reservation are blocked' });
  }

  const job = queue.create('reserve_seat').save((err) => {
    if (err) {
      return res.json({ status: 'Reservation failed' });
    }
    res.json({ status: 'Reservation in process' });
  });

  job.on('complete', () => {
    console.log(`Seat reservation job ${job.id} completed`);
  });

  job.on('failed', (err) => {
    console.log(`Seat reservation job ${job.id} failed: ${err}`);
  });
});

// Route: GET /process
app.get('/process', (req, res) => {
  res.json({ status: 'Queue processing' });

  queue.process('reserve_seat', async (job, done) => {
    try {
      const currentSeats = await getCurrentAvailableSeats();
      const seats = parseInt(currentSeats, 10);

      if (seats <= 0) {
        reservationEnabled = false;
        throw new Error('Not enough seats available');
      }

      reserveSeat(seats - 1);

      if (seats - 1 === 0) {
        reservationEnabled = false;
      }

      done();
    } catch (err) {
      done(err);
    }
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
