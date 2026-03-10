const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir arquivos estáticos da pasta "public"
app.use(express.static(path.join(__dirname, 'public')));

// Armazenamento em memória (simples)
// Exemplo: { "note-1": { title: "Nota 1", content: "..." }, ... }
const notes = {};

// Listener de conexões do Socket.io
io.on('connection', (socket) => {
    console.log(`Usuário conectado: ${socket.id}`);

    // Quando um usuário solicitar as notas atuais
    socket.on('get_notes', () => {
        socket.emit('load_notes', notes);
    });

    // Quando um usuário criar uma nota
    socket.on('create_note', (noteId) => {
        if (!notes[noteId]) {
            notes[noteId] = { title: 'Nova Nota', content: '' };
            io.emit('note_created', noteId, notes[noteId]); // Avisa a todos
        }
    });

    // Quando um usuário deletar uma nota
    socket.on('delete_note', (noteId) => {
        if (notes[noteId]) {
            delete notes[noteId];
            io.emit('note_deleted', noteId); // Avisa a todos
        }
    });

    // Quando um usuário solicitar para apagar todas as notas
    socket.on('clear_all_notes', () => {
        for (let key in notes) delete notes[key];
        io.emit('all_notes_cleared');
    });

    // Quando um usuário editar uma nota (título ou conteúdo)
    socket.on('edit_note', (data) => {
        const { noteId, title, content } = data;

        if (notes[noteId]) {
            if (title !== undefined) notes[noteId].title = title;
            if (content !== undefined) notes[noteId].content = content;

            // Fazer o broadcast para TODOS os OUTROS clientes
            // (o cliente que enviou já está com a interface atualizada)
            socket.broadcast.emit('note_updated', {
                noteId,
                title: notes[noteId].title,
                content: notes[noteId].content,
                updateBy: socket.id
            });
        }
    });

    socket.on('disconnect', () => {
        console.log(`Usuário desconectado: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta http://localhost:${PORT}`);
});
