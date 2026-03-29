#!/bin/bash
# Install dependencies for Setup Wizard and Bridge

echo "Installing Setup Wizard dependencies..."
npm install --save chalk@4.1.2 inquirer@8.2.5 ora@5.4.1 dotenv@16.0.3 joi@17.9.2 enquirer@2.4.1

echo "Installing Bridge dependencies..."
npm install --save express@4.18.2 cors@2.8.5 helmet@7.0.0 express-rate-limit@6.7.0 winston@3.9.0 uuid@9.0.0

echo "Dependencies installed!"