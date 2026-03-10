const socket = io();

// Elementos da DOM
const notesListEl = document.getElementById('notes-list');
const btnNewNote = document.getElementById('btn-new-note');
const welcomeScreen = document.getElementById('welcome-screen');
const noteEditor = document.getElementById('note-editor');
const noteTitleInput = document.getElementById('note-title');
const noteContentInput = document.getElementById('note-content');
const btnDeleteNote = document.getElementById('btn-delete-note');
const syncStatus = document.getElementById('sync-status');
const btnClearAll = document.getElementById('btn-clear-all');

// Estado da Aplicação
let notesMap = {}; // Guarda localmente as notas { [id]: {title, content} }
let currentNoteId = null;

// Funções Auxiliares de UI
function showEditor(show) {
    if (show) {
        welcomeScreen.classList.remove('active');
        noteEditor.classList.remove('hidden');
    } else {
        welcomeScreen.classList.add('active');
        noteEditor.classList.add('hidden');
    }
}

function updateNotesList() {
    notesListEl.innerHTML = ''; // Limpa a lista

    const noteIds = Object.keys(notesMap);

    if (noteIds.length === 0) {
        notesListEl.innerHTML = '<p style="color:var(--text-secondary); text-align:center; padding: 20px 0; font-size: 0.9rem;">Nenhuma nota encontrada.<br>Crie uma nova!</p>';
        return;
    }

    // Para cada nota, criamos um item na lista
    noteIds.reverse().forEach(id => {
        const note = notesMap[id];
        const noteEl = document.createElement('div');
        noteEl.className = `note-item ${id === currentNoteId ? 'active' : ''}`;

        const title = note.title || 'Sem título';
        const abstract = note.content ? note.content.substring(0, 60) + '...' : 'Vazio...';

        noteEl.innerHTML = `
            <div class="note-info" onclick="selectNote('${id}')">
                <h3>${title}</h3>
                <p>${abstract}</p>
            </div>
            <button class="delete-sidebar-btn" onclick="deleteNoteEvent(event, '${id}')" title="Apagar Nota">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
        `;

        notesListEl.appendChild(noteEl);
    });
}

function selectNote(id) {
    currentNoteId = id;
    const note = notesMap[id];

    noteTitleInput.value = note.title;
    noteContentInput.value = note.content;

    updateNotesList(); // Atualiza classes active
    showEditor(true);
}

function generateId() {
    return 'note-' + Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function showSyncing() {
    syncStatus.classList.add('syncing');
    syncStatus.innerHTML = '<span class="status-dot"></span> Salvando...';

    clearTimeout(window.syncTimeout);
    window.syncTimeout = setTimeout(() => {
        syncStatus.classList.remove('syncing');
        syncStatus.innerHTML = '<span class="status-dot"></span> Sincronizado';
    }, 1000);
}

// Lógica de Eventos da Interface

window.deleteNoteEvent = function (event, id) {
    event.stopPropagation();
    if (confirm('Tem certeza que deseja apagar esta nota?')) {
        socket.emit('delete_note', id);
        delete notesMap[id];
        if (currentNoteId === id) {
            currentNoteId = null;
            showEditor(false);
        }
        updateNotesList();
    }
};

if (btnClearAll) {
    btnClearAll.addEventListener('click', () => {
        if (Object.keys(notesMap).length === 0) return;
        if (confirm('Tem certeza que deseja apagar TODAS as notas salvas? Isso não pode ser desfeito.')) {
            socket.emit('clear_all_notes');
            notesMap = {};
            currentNoteId = null;
            showEditor(false);
            updateNotesList();
        }
    });
}

btnNewNote.addEventListener('click', () => {
    const id = generateId();
    currentNoteId = id;

    // Dispara a criação para o servidor
    socket.emit('create_note', id);

    // Atualiza UI base imediata
    notesMap[id] = { title: '', content: '' };
    selectNote(id);
});

btnDeleteNote.addEventListener('click', () => {
    if (confirm('Tem certeza que deseja excluir esta nota?')) {
        socket.emit('delete_note', currentNoteId);
        delete notesMap[currentNoteId];
        currentNoteId = null;
        showEditor(false);
        updateNotesList();
    }
});

// Envio de Alterações (com throttling simples / instantâneo)
function handleEdit() {
    if (!currentNoteId) return;

    const title = noteTitleInput.value;
    const content = noteContentInput.value;

    notesMap[currentNoteId] = { title, content };

    showSyncing();
    updateNotesList(); // Atualizar o sidebar (título/resumo)

    // Enviar para o servidor
    socket.emit('edit_note', {
        noteId: currentNoteId,
        title,
        content
    });
}

noteTitleInput.addEventListener('input', handleEdit);
noteContentInput.addEventListener('input', handleEdit);


// ---- CONEXÕES SOCKET.IO (RECEBIMENTO) ----

socket.on('connect', () => {
    console.log('Conectado ao servidor.');
    socket.emit('get_notes'); // Pede o estado inicial do servidor
});

socket.on('load_notes', (serverNotes) => {
    notesMap = serverNotes;
    updateNotesList();

    // Se a nota atual foi deletada enquanto estava fora, reseta
    if (currentNoteId && !notesMap[currentNoteId]) {
        currentNoteId = null;
        showEditor(false);
    } else if (currentNoteId) {
        // Atualiza a vista atual
        selectNote(currentNoteId);
    }
});

socket.on('note_created', (noteId, initialData) => {
    notesMap[noteId] = initialData;
    updateNotesList();
});

socket.on('all_notes_cleared', () => {
    notesMap = {};
    currentNoteId = null;
    showEditor(false);
    updateNotesList();
    alert('Todas as notas foram apagadas por um colaborador.');
});

socket.on('note_deleted', (noteId) => {
    delete notesMap[noteId];

    if (currentNoteId === noteId) {
        currentNoteId = null;
        showEditor(false);
        alert('A nota atual foi excluída por outro usuário.');
    }

    updateNotesList();
});

socket.on('note_updated', (data) => {
    const { noteId, title, content } = data;

    // Se a nota já existir, atualizamos
    if (notesMap[noteId]) {
        notesMap[noteId].title = title;
        notesMap[noteId].content = content;

        // Se a nota que foi atualizada é a nota sendo vista atualmente
        if (noteId === currentNoteId) {
            // Pequeno truque para não mover o cursor do usuário quando o texto chega, 
            // embora em uma aplicação real avançada usaríamos CRDT ou Operarional Transformation
            const titleActive = document.activeElement === noteTitleInput;
            const contentActive = document.activeElement === noteContentInput;

            if (!titleActive) noteTitleInput.value = title;

            // Para o textarea é mais delicado. Vamos apenas substituir o valor por agora.
            // O cursor se perderá no usuário atual de forma simples, mas como a internet é rápida:
            if (!contentActive) {
                noteContentInput.value = content;
            } else {
                // Se ESTE usuário está digitando e recebe uma atualização (conflito síncrono).
                // Tentaremos apenas preservar o cursor na posição.
                const cursorStart = noteContentInput.selectionStart;
                const cursorEnd = noteContentInput.selectionEnd;
                noteContentInput.value = content;
                noteContentInput.setSelectionRange(cursorStart, cursorEnd);
            }
        }

        updateNotesList(); // Atualiza a sidebar
    }
});
