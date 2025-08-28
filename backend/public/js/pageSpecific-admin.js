// frontend/static/js/pageSpecific-admin.js
// Lógica específica para a página de administração.

import { showMessage, showLoading } from './utils.js';
import { setupLogoutButton } from './session.js'; // Usamos o mesmo botão de logout, mas com ID diferente

document.addEventListener('DOMContentLoaded', async () => {
    showLoading(true); // Mostra o carregamento ao iniciar a página

    const adminGreeting = document.getElementById('admin-greeting');
    const totalUsersDisplay = document.getElementById('total-users');
    const pendingDepositsDisplay = document.getElementById('pending-deposits');
    const pendingWithdrawalsDisplay = document.getElementById('pending-withdrawals');
    const activeInvestmentsDisplay = document.getElementById('active-investments');
    const totalInvestedDisplay = document.getElementById('total-invested');
    const totalUserEarningsDisplay = document.getElementById('total-user-earnings');
    const depositsList = document.getElementById('deposits-list');
    const withdrawalsList = document.getElementById('withdrawals-list');
    const logoutAdminButton = document.getElementById('logout-admin-button');

    // **IMPORTANTE**: Para uma página de admin real, é crucial ter uma forma de autenticação de admin.
    // Atualmente, estamos a usar o `userToken` genérico. No backend, precisaríamos de uma verificação
    // adicional para confirmar se o utilizador autenticado tem permissões de administrador.
    const userToken = localStorage.getItem('userToken');
    const username = localStorage.getItem('username'); // Assumimos que o username do admin é armazenado

    if (!userToken) {
        showMessage('Acesso negado. Por favor, faça login como administrador.', true);
        setTimeout(() => { window.location.href = '/Login.html'; }, 2000);
        showLoading(false);
        return;
    }

    if (adminGreeting && username) {
        adminGreeting.innerText = `Bem-vindo(a), ${username}!`;
    }

    async function fetchAdminData() {
        try {
            // A API de admin não existe ainda no backend, isto é um placeholder.
            // Precisaríamos de um endpoint como /api/admin/dashboard-data
            const response = await fetch('http://localhost:5000/api/admin/dashboard-data', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${userToken}`,
                    'Content-Type': 'application/json'
                }
            });
            const data = await response.json();

            if (response.ok) {
                // Atualiza os cartões do dashboard
                if (totalUsersDisplay) totalUsersDisplay.innerText = data.totalUsers !== undefined ? data.totalUsers : 'N/A';
                if (pendingDepositsDisplay) pendingDepositsDisplay.innerText = data.pendingDeposits !== undefined ? data.pendingDeposits : 'N/A';
                if (pendingWithdrawalsDisplay) pendingWithdrawalsDisplay.innerText = data.pendingWithdrawals !== undefined ? data.pendingWithdrawals : 'N/A';
                if (activeInvestmentsDisplay) activeInvestmentsDisplay.innerText = data.activeInvestments !== undefined ? data.activeInvestments : 'N/A';
                if (totalInvestedDisplay) totalInvestedDisplay.innerText = `Kz ${parseFloat(data.totalInvested || 0).toFixed(2).replace('.', ',')}`;
                if (totalUserEarningsDisplay) totalUserEarningsDisplay.innerText = `Kz ${parseFloat(data.totalUserEarnings || 0).toFixed(2).replace('.', ',')}`;

                // Renderiza a lista de depósitos
                renderList(depositsList, data.deposits, 'deposit');

                // Renderiza a lista de saques
                renderList(withdrawalsList, data.withdrawals, 'withdrawal');

            } else {
                showMessage('Erro ao carregar dados do admin: ' + (data.error || data.message || 'Erro desconhecido.'), true);
                if (response.status === 401 || response.status === 403) {
                    setTimeout(() => { window.location.href = '/Login.html'; }, 2000);
                }
            }
        } catch (error) {
            console.error('Erro na requisição de dados do admin:', error);
            showMessage('Não foi possível conectar ao servidor para obter dados de administração.', true);
        } finally {
            showLoading(false);
        }
    }

    // Função auxiliar para renderizar listas de depósitos/saques
    function renderList(container, items, type) {
        if (!container) return;
        container.innerHTML = ''; // Limpa a lista existente

        if (items && items.length > 0) {
            items.forEach(item => {
                const listItem = document.createElement('li');
                listItem.classList.add('admin-list-item');
                let detailsHtml = '';
                let actionButton = '';

                if (type === 'deposit') {
                    detailsHtml = `
                        <span>ID: ${item.id.substring(0, 8)}...</span>
                        <span>Utilizador: ${item.username || item.user_id.substring(0, 8)}...</span>
                        <span>Valor: <strong>Kz ${parseFloat(item.amount).toFixed(2).replace('.', ',')}</strong></span>
                        <span>Comprovativo: <a href="http://localhost:5000/uploads/${item.receipt_filename}" target="_blank" class="text-blue-500 hover:underline">Ver</a></span>
                        <span>Data: ${new Date(item.timestamp).toLocaleString('pt-PT')}</span>
                    `;
                    actionButton = `
                        <button class="action-button approve-deposit" data-id="${item.id}">Aprovar</button>
                        <button class="action-button reject-deposit" data-id="${item.id}" style="background-color: #dc3545;">Rejeitar</button>
                    `;
                } else if (type === 'withdrawal') {
                    detailsHtml = `
                        <span>ID: ${item.id.substring(0, 8)}...</span>
                        <span>Utilizador: ${item.username || item.user_id.substring(0, 8)}...</span>
                        <span>Valor Solicitado: <strong>Kz ${parseFloat(item.requested_amount).toFixed(2).replace('.', ',')}</strong></span>
                        <span>Valor Líquido: <strong>Kz ${parseFloat(item.actual_amount).toFixed(2).replace('.', ',')}</strong></span>
                        <span>Conta: ${item.account_number_used || 'N/A'}</span>
                        <span>Data: ${new Date(item.timestamp).toLocaleString('pt-PT')}</span>
                    `;
                    actionButton = `
                        <button class="action-button approve-withdrawal" data-id="${item.id}">Aprovar</button>
                        <button class="action-button reject-withdrawal" data-id="${item.id}" style="background-color: #dc3545;">Rejeitar</button>
                    `;
                }

                listItem.innerHTML = `<div class="details">${detailsHtml}</div><div class="actions">${actionButton}</div>`;
                container.appendChild(listItem);
            });

            // Adiciona listeners para os botões de ação
            if (type === 'deposit') {
                document.querySelectorAll('.approve-deposit').forEach(button => button.addEventListener('click', handleDepositAction));
                document.querySelectorAll('.reject-deposit').forEach(button => button.addEventListener('click', handleDepositAction));
            } else if (type === 'withdrawal') {
                document.querySelectorAll('.approve-withdrawal').forEach(button => button.addEventListener('click', handleWithdrawalAction));
                document.querySelectorAll('.reject-withdrawal').forEach(button => button.addEventListener('click', handleWithdrawalAction));
            }

        } else {
            const placeholderItem = document.createElement('li');
            placeholderItem.classList.add('admin-list-item', 'placeholder-item');
            placeholderItem.innerText = `Nenhum ${type === 'deposit' ? 'depósito' : 'saque'} pendente.`;
            container.appendChild(placeholderItem);
        }
    }

    async function handleDepositAction(event) {
        const depositId = event.target.dataset.id;
        const action = event.target.classList.contains('approve-deposit') ? 'approve' : 'reject';

        showLoading(true);
        try {
            const response = await fetch('http://localhost:5000/api/admin/deposits/action', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${userToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ depositId, action })
            });
            const data = await response.json();

            if (response.ok) {
                showMessage(data.message, false, 2000);
                await fetchAdminData(); // Recarrega os dados para atualizar a lista
            } else {
                showMessage('Erro ao processar depósito: ' + (data.error || data.message || 'Erro desconhecido.'), true);
            }
        } catch (error) {
            console.error('Erro na requisição de ação de depósito:', error);
            showMessage('Não foi possível conectar ao servidor.', true);
        } finally {
            showLoading(false);
        }
    }

    async function handleWithdrawalAction(event) {
        const withdrawalId = event.target.dataset.id;
        const action = event.target.classList.contains('approve-withdrawal') ? 'approve' : 'reject';

        showLoading(true);
        try {
            const response = await fetch('http://localhost:5000/api/admin/withdrawals/action', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${userToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ withdrawalId, action })
            });
            const data = await response.json();

            if (response.ok) {
                showMessage(data.message, false, 2000);
                await fetchAdminData(); // Recarrega os dados para atualizar a lista
            } else {
                showMessage('Erro ao processar saque: ' + (data.error || data.message || 'Erro desconhecido.'), true);
            }
        } catch (error) {
            console.error('Erro na requisição de ação de saque:', error);
            showMessage('Não foi possível conectar ao servidor.', true);
        } finally {
            showLoading(false);
        }
    }

    // Carrega os dados do admin ao carregar a página
    await fetchAdminData();

    // Configura o botão de logout
    if (logoutAdminButton) {
        setupLogoutButton('logout-admin-button');
    }
});
