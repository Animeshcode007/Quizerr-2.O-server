require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const connectDB = require('./config/db');
const Question = require('./models/Question');
const PORT = process.env.PORT || 5001;

connectDB();

const app = express();
const corsOptions = {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
};
app.use(cors(corsOptions));
const server = http.createServer(app);
const io = new Server(server, {
    cors: corsOptions
});
app.use(express.json());


app.get('/', (req, res) => {
    res.send('Multiplayer Quiz API is alive!');
});

let lobbies = {};
const MAX_PLAYERS_PER_LOBBY = 8;

const getPublicLobbyDetails = (lobby) => {
    if (!lobby) return null;
    return {
        id: lobby.id,
        name: lobby.name,
        hostName: lobby.host?.name || 'Unknown',
        playerCount: lobby.players.length,
        maxPlayers: lobby.settings.maxPlayers,
        category: lobby.settings.category,
        status: lobby.status,
    };
};

const getAllPublicLobbies = () => {
    return Object.values(lobbies)
        .filter(lobby => lobby.status === 'waiting')
        .map(getPublicLobbyDetails);
};


io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    socket.on('getLobbies', (callback) => {
        try {
            callback(getAllPublicLobbies());
        } catch (error) {
            console.error("Error in getLobbies:", error);
            callback({ error: "Failed to fetch lobbies" });
        }
    });

    socket.on('createLobby', ({ playerName, lobbyName, category }, callback) => {
        try {
            const lobbyId = `lobby_${Math.random().toString(36).substr(2, 7)}`;
            const newLobby = {
                id: lobbyId,
                name: lobbyName || `${playerName}'s Game`,
                host: { id: socket.id, name: playerName },
                players: [{ id: socket.id, name: playerName, score: 0, isHost: true }],
                settings: {
                    category: category || 'General Knowledge',
                    maxPlayers: MAX_PLAYERS_PER_LOBBY,
                    questionTime: 15,
                    numQuestions: 10
                },
                status: 'waiting',
                questions: [],
                currentQuestionIndex: -1,
                playerAnswers: {},
                questionStartTime: null,
            };
            lobbies[lobbyId] = newLobby;
            socket.join(lobbyId);

            console.log(`Lobby ${lobbyId} created by ${playerName}`);
            callback({ success: true, lobbyId, lobbyDetails: newLobby });
            io.emit('lobbiesListUpdate', getAllPublicLobbies());
        } catch (error) {
            console.error("Error creating lobby:", error);
            callback({ success: false, message: "Failed to create lobby." });
        }
    });

    socket.on('joinLobby', ({ lobbyId, playerName }, callback) => {
        try {
            const lobby = lobbies[lobbyId];
            if (!lobby) {
                return callback({ success: false, message: 'Lobby not found.' });
            }
            if (lobby.status !== 'waiting') {
                return callback({ success: false, message: 'Game has already started or finished.' });
            }
            if (lobby.players.length >= lobby.settings.maxPlayers) {
                return callback({ success: false, message: 'Lobby is full.' });
            }
            if (lobby.players.find(p => p.id === socket.id)) {
                socket.join(lobbyId);
                return callback({ success: true, lobbyId, lobbyDetails: lobby, reconnected: true });
            }

            const newPlayer = { id: socket.id, name: playerName, score: 0, isHost: false };
            lobby.players.push(newPlayer);
            socket.join(lobbyId);

            console.log(`${playerName} joined lobby ${lobbyId}`);
            callback({ success: true, lobbyId, lobbyDetails: lobby });
            io.to(lobbyId).emit('playerJoined', { player: newPlayer, lobbyDetails: lobby });
            io.emit('lobbiesListUpdate', getAllPublicLobbies());
        } catch (error) {
            console.error("Error joining lobby:", error);
            callback({ success: false, message: "Failed to join lobby." });
        }
    });

    socket.on('leaveLobby', ({ lobbyId }, callback) => {
        try {
            const lobby = lobbies[lobbyId];
            if (!lobby) return callback?.({ success: false, message: "Lobby not found." });

            socket.leave(lobbyId);
            lobby.players = lobby.players.filter(p => p.id !== socket.id);

            console.log(`Player ${socket.id} left lobby ${lobbyId}`);

            if (lobby.players.length === 0) {
                console.log(`Lobby ${lobbyId} is empty, deleting.`);
                clearTimeout(lobby.questionTimeout);
                delete lobbies[lobbyId];
                io.emit('lobbiesListUpdate', getAllPublicLobbies());
            } else {
                if (lobby.host.id === socket.id) {
                    lobby.host = { id: lobby.players[0].id, name: lobby.players[0].name };
                    lobby.players[0].isHost = true;
                    console.log(`Host left, new host for ${lobbyId} is ${lobby.host.name}`);
                    io.to(lobbyId).emit('newHost', { host: lobby.host, lobbyDetails: lobby });
                }
                io.to(lobbyId).emit('playerLeft', { playerId: socket.id, lobbyDetails: lobby });
                io.emit('lobbiesListUpdate', getAllPublicLobbies());
            }
            callback?.({ success: true });
        } catch (error) {
            console.error("Error leaving lobby:", error);
            callback?.({ success: false, message: "Error leaving lobby." });
        }
    });

    socket.on('startGame', async ({ lobbyId }, callback) => {
        try {
            const lobby = lobbies[lobbyId];
            if (!lobby) return callback({ success: false, message: "Lobby not found." });
            if (lobby.host.id !== socket.id) return callback({ success: false, message: "Only the host can start the game." });
            if (lobby.status !== 'waiting') return callback({ success: false, message: "Game is already in progress or finished." });

            if (lobby.players.length < 1) {
                return callback({ success: false, message: "Not enough players to start." });
            }

            lobby.status = 'playing';
            lobby.currentQuestionIndex = -1;
            lobby.playerAnswers = {};
            lobby.players.forEach(p => p.score = 0);
            const questionsFromDB = await Question.find({ category: lobby.settings.category })
                .limit(50);
            if (questionsFromDB.length === 0) {
                lobby.status = 'waiting';
                return callback({ success: false, message: `No questions found for category: ${lobby.settings.category}` });
            }

            lobby.questions = questionsFromDB.sort(() => 0.5 - Math.random()).slice(0, lobby.settings.numQuestions);

            if (lobby.questions.length < lobby.settings.numQuestions && lobby.questions.length === 0) {
                lobby.status = 'waiting';
                return callback({ success: false, message: `Not enough questions available for the game (need ${lobby.settings.numQuestions}, found ${lobby.questions.length}).` });
            }
            if (lobby.questions.length < lobby.settings.numQuestions) {
                console.warn(`Lobby ${lobbyId}: Only found ${lobby.questions.length} questions for category ${lobby.settings.category}, requested ${lobby.settings.numQuestions}. Proceeding with available questions.`);
            }


            io.to(lobbyId).emit('gameStarted', { lobbyDetails: lobby, players: lobby.players });
            console.log(`Game started in lobby ${lobbyId}`);
            callback({ success: true });

            setTimeout(() => {
                sendNextQuestion(lobbyId);
            }, 1000);

        } catch (error) {
            console.error(`Error starting game in lobby ${lobbyId}:`, error);
            if (lobbies[lobbyId]) lobbies[lobbyId].status = 'waiting';
            callback({ success: false, message: "Server error starting game." });
        }
    });
    socket.on('submitAnswer', ({ lobbyId, questionId, answerIndex }, callback) => {
        try {
            const lobby = lobbies[lobbyId];
            if (!lobby || lobby.status !== 'playing') return callback({ success: false, message: "Game not active." });

            const currentQuestionData = lobby.questions[lobby.currentQuestionIndex];
            if (!currentQuestionData || currentQuestionData._id.toString() !== questionId) {
                return callback({ success: false, message: "Question mismatch or not found." });
            }

            const player = lobby.players.find(p => p.id === socket.id);
            if (!player) return callback({ success: false, message: "Player not found in lobby." });

            if (lobby.playerAnswers[lobby.currentQuestionIndex] && lobby.playerAnswers[lobby.currentQuestionIndex][socket.id] !== undefined) {
                return callback({ success: false, message: "You have already answered this question." });
            }
            if (!lobby.playerAnswers[lobby.currentQuestionIndex]) {
                lobby.playerAnswers[lobby.currentQuestionIndex] = {};
            }
            lobby.playerAnswers[lobby.currentQuestionIndex][socket.id] = answerIndex;

            let scoreEarned = 0;
            const isCorrect = answerIndex === currentQuestionData.correctAnswerIndex;
            console.log(`Player ${player.name} submitted index: ${answerIndex}, Correct index: ${currentQuestionData.correctAnswerIndex}, Is correct: ${isCorrect}`);
            if (isCorrect) {
                scoreEarned = 10;
                player.score += scoreEarned;
            }
            socket.emit('answerFeedback', {
                correct: isCorrect,
                correctAnswerIndex: currentQuestionData.correctAnswerIndex,
                scoreEarned: scoreEarned,
                currentScore: player.score
            });
            io.to(lobbyId).emit('scoreUpdate', lobby.players.map(p => ({ id: p.id, name: p.name, score: p.score })));
            callback({ success: true });
            console.log(`Lobby ${lobbyId}: Player ${player.name} answered ${isCorrect ? 'correctly' : 'incorrectly'}. Score: ${player.score}`);

            const activePlayersInLobby = lobby.players.length;
            const answersThisRound = Object.keys(lobby.playerAnswers[lobby.currentQuestionIndex]).length;
            if (answersThisRound >= activePlayersInLobby) {
                console.log(`Lobby ${lobbyId}: All players answered question ${lobby.currentQuestionIndex + 1}.`);
                if (lobby.questionTimeout) {
                    clearTimeout(lobby.questionTimeout);
                    handleQuestionTimeout(lobbyId);
                }
            }

        } catch (error) {
            console.error(`Error processing answer in lobby ${lobbyId}:`, error);
            callback({ success: false, message: "Server error processing answer." });
        }
    });


    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        for (const lobbyId in lobbies) {
            const lobby = lobbies[lobbyId];
            const playerIndex = lobby.players.findIndex(p => p.id === socket.id);
            if (playerIndex > -1) {
                const playerName = lobby.players[playerIndex].name;
                socket.leave(lobbyId);
                lobby.players.splice(playerIndex, 1);
                console.log(`Player ${playerName} (${socket.id}) disconnected from lobby ${lobbyId}`);

                if (lobby.players.length === 0) {
                    console.log(`Lobby ${lobbyId} is empty after disconnect, deleting.`);
                    clearTimeout(lobby.questionTimeout);
                    delete lobbies[lobbyId];
                    io.emit('lobbiesListUpdate', getAllPublicLobbies());
                } else {
                    if (lobby.host.id === socket.id) {
                        lobby.host = { id: lobby.players[0].id, name: lobby.players[0].name };
                        lobby.players[0].isHost = true;
                        console.log(`Host disconnected, new host for ${lobbyId} is ${lobby.host.name}`);
                        io.to(lobbyId).emit('newHost', { host: lobby.host, lobbyDetails: lobby });
                    }
                    io.to(lobbyId).emit('playerLeft', { playerId: socket.id, playerName, lobbyDetails: lobby });
                    io.emit('lobbiesListUpdate', getAllPublicLobbies());
                }
                break;
            }
        }
    });
});
const sendNextQuestion = (lobbyId) => {
    const lobby = lobbies[lobbyId];
    if (!lobby || lobby.status !== 'playing') return;
    if (lobby.questionTimeout) clearTimeout(lobby.questionTimeout);

    lobby.currentQuestionIndex++;
    lobby.playerAnswers[lobby.currentQuestionIndex] = {};

    if (lobby.currentQuestionIndex < lobby.questions.length) {
        const questionToSend = { ...lobby.questions[lobby.currentQuestionIndex].toObject() };
        delete questionToSend.correctAnswerIndex;

        lobby.questionStartTime = Date.now();

        io.to(lobbyId).emit('newQuestion', {
            question: questionToSend,
            questionNumber: lobby.currentQuestionIndex + 1,
            totalQuestions: lobby.questions.length,
            timeLimit: lobby.settings.questionTime,
            players: lobby.players,
        });

        console.log(`Lobby ${lobbyId}: Sent question ${lobby.currentQuestionIndex + 1}`);
        lobby.questionTimeout = setTimeout(() => {
            console.log(`Lobby ${lobbyId}: Question ${lobby.currentQuestionIndex + 1} timed out.`);
            handleQuestionTimeout(lobbyId);
        }, lobby.settings.questionTime * 1000 + 500);
    } else {
        endGame(lobbyId);
    }
};

const handleQuestionTimeout = (lobbyId) => {
    const lobby = lobbies[lobbyId];
    if (!lobby || lobby.status !== 'playing' || !lobby.questions[lobby.currentQuestionIndex]) return;
    if (lobby.questionTimeout) clearTimeout(lobby.questionTimeout);
    lobby.questionTimeout = null;

    const currentQuestionData = lobby.questions[lobby.currentQuestionIndex];

    io.to(lobbyId).emit('roundEnd', {
        correctAnswerIndex: currentQuestionData.correctAnswerIndex,
    });
    console.log(`Lobby ${lobbyId}: Round ended for question ${lobby.currentQuestionIndex + 1}. Correct answer was index ${currentQuestionData.correctAnswerIndex}`);

    setTimeout(() => {
        sendNextQuestion(lobbyId);
    }, 3000);
};

const endGame = (lobbyId) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) return;
    if (lobby.questionTimeout) clearTimeout(lobby.questionTimeout);
    lobby.questionTimeout = null;
    lobby.status = 'finished';
    const finalScores = lobby.players.sort((a, b) => b.score - a.score);

    io.to(lobbyId).emit('gameOver', {
        players: finalScores,
        lobbySettings: lobby.settings
    });
    console.log(`Game ended in lobby ${lobbyId}. Final scores sent.`);
};

server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));