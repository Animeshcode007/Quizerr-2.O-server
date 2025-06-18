const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Question = require('../models/Question');

const questionsToSeed = [
    {
        text: "What is the currency of Switzerland?",
        options: ["Euro", "Dollar", "Swiss Franc", "Pound"],
        correctAnswerIndex: 2,
        category: "General Knowledge",
        difficulty: "medium"
    },
    {
        text: "Which movie won the Academy Award for Best Picture in 2020?",
        options: ["1917", "Joker", "Parasite", "Once Upon a Time in Hollywood"],
        correctAnswerIndex: 2,
        category: "Movies",
        difficulty: "hard"
    },
    {
        text: "What gas do plants absorb from the atmosphere?",
        options: ["Oxygen", "Nitrogen", "Carbon Dioxide", "Hydrogen"],
        correctAnswerIndex: 2,
        category: "Science & Nature",
        difficulty: "easy"
    },
    {
        text: "Who is known as the 'King of Pop'?",
        options: ["Elvis Presley", "Michael Jackson", "Prince", "James Brown"],
        correctAnswerIndex: 1,
        category: "Music",
        difficulty: "easy"
    },
    {
        text: "Which country is known as the Land of the Rising Sun?",
        options: ["China", "South Korea", "Japan", "Thailand"],
        correctAnswerIndex: 2,
        category: "General Knowledge",
        difficulty: "easy"
    },
    {
        text: "Mount Kilimanjaro is located in which country?",
        options: ["Kenya", "Tanzania", "Uganda", "Ethiopia"],
        correctAnswerIndex: 1,
        category: "General Knowledge",
        difficulty: "hard"
    },
    {
        text: "Which country hosted the 2016 Summer Olympics?",
        options: ["China", "Brazil", "United Kingdom", "Russia"],
        correctAnswerIndex: 1,
        category: "General Knowledge",
        difficulty: "easy"
    },
    {
        text: "What is the smallest prime number?",
        options: ["0", "1", "2", "3"],
        correctAnswerIndex: 2,
        category: "General Knowledge",
        difficulty: "easy"
    },
    {
        text: "Which famous scientist developed the theory of general relativity?",
        options: ["Isaac Newton", "Albert Einstein", "Nikola Tesla", "Galileo Galilei"],
        correctAnswerIndex: 1,
        category: "General Knowledge",
        difficulty: "medium"
    },
    {
        text: "Who wrote the play ‘Romeo and Juliet’?",
        options: ["Christopher Marlowe", "William Shakespeare", "Ben Jonson", "John Donne"],
        correctAnswerIndex: 1,
        category: "General Knowledge",
        difficulty: "easy"
    },
    {
        text: "Who was the first emperor of the Roman Empire?",
        options: ["Julius Caesar", "Augustus", "Nero", "Caligula"],
        correctAnswerIndex: 1,
        category: "History",
        difficulty: "medium"
    },
    {
        text: "In which year did the French Revolution begin?",
        options: ["1787", "1789", "1791", "1793"],
        correctAnswerIndex: 1,
        category: "History",
        difficulty: "hard"
    },
    {
        text: "Which ancient civilization built Machu Picchu?",
        options: ["Maya", "Aztec", "Inca", "Olmec"],
        correctAnswerIndex: 2,
        category: "History",
        difficulty: "medium"
    },
    {
        text: "Which country won the FIFA World Cup in 2014?",
        options: ["Brazil", "Germany", "Argentina", "Spain"],
        correctAnswerIndex: 1,
        category: "Sports",
        difficulty: "easy"
    },
    {
        text: "How many players are there on a standard rugby union team?",
        options: ["11", "13", "15", "17"],
        correctAnswerIndex: 2,
        category: "Sports",
        difficulty: "medium"
    },
    {
        text: "Who holds the record for the most Grand Slam singles titles in men’s tennis?",
        options: ["Roger Federer", "Rafael Nadal", "Novak Djokovic", "Pete Sampras"],
        correctAnswerIndex: 2,
        category: "Sports",
        difficulty: "hard"
    },
];

const seedDB = async () => {
    try {
        await connectDB();
        console.log("Removing old questions...");
        await Question.deleteMany({});
        console.log("Old questions removed.");

        console.log("Seeding new questions...");
        await Question.insertMany(questionsToSeed);
        console.log("Data Seeded Successfully!");

    } catch (error) {
        console.error("Error seeding data:", error);
    } finally {
        mongoose.disconnect();
        console.log("MongoDB disconnected.");
    }
};

seedDB();