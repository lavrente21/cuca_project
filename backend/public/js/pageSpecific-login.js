// frontend/static/js/pageSpecific-login.js
// Lógica específica para a página de login.

import { showMessage, showLoading } from './utils.js';
import { redirectIfLoggedIn } from './session.js'; // Importa redirectIfLoggedIn

// Redireciona se o utilizador já estiver logado (evita acesso à página de login logado)
redirectIfLoggedIn();

document.addEventListener('DOMContentLoaded', () => {
    const loginButton = document.getElementById('login-btn');
    if (loginButton) {
        loginButton.addEventListener('click', async () => {
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;

            if (!username || !password) {
                showMessage('Por favor, preencha todos os campos.');
                return;
            }

            showLoading(true);

            try {
                // *** O URL DO BACKEND AGORA É O NODE.JS (ainda porta 5000 para consistência) ***
                const response = await fetch('http://localhost:5000/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok) {
                    showMessage('Login bem-sucedido! Bem-vindo(a), ' + data.username + ' (ID: ' + data.userIdCode + ')');
                    // Armazena o ID do utilizador, o JWT e o userIdCode no localStorage
                    localStorage.setItem('userId', data.userId);
                    localStorage.setItem('userToken', data.token); // Agora é um JWT
                    localStorage.setItem('username', data.username);
                    localStorage.setItem('user_id_code', data.userIdCode);

                    setTimeout(() => {
                        window.location.href = '/Pagina inicial.html';
                    }, 2000);
                } else {
                    showMessage('Erro no login: ' + (data.message || data.error || 'Erro desconhecido.'));
                }
            } catch (error) {
                console.error('Erro na requisição (fetch error):', error);
                showMessage('Não foi possível conectar ao servidor ou houve um erro inesperado. Verifique o console do navegador para mais detalhes.');
            } finally {
                showLoading(false);
            }
        });
    }
});
