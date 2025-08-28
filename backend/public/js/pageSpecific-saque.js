// frontend/static/js/pageSpecific-saque.js
// Lógica específica para a página de saque.

import { showMessage, showLoading } from './utils.js';
import { protectPage } from './session.js'; 

protectPage();

document.addEventListener('DOMContentLoaded', async () => {
    showLoading(false); 

    const userToken = localStorage.getItem('userToken');

    if (!userToken) {
        return;
    }

    const currentWithdrawBalanceDisplay = document.getElementById('current-withdraw-balance');
    const currentRechargeBalanceDisplay = document.getElementById('current-recharge-balance'); 
    
    const withdrawAmountInput = document.getElementById('withdrawAmount');
    const withdrawAllCheckbox = document.getElementById('withdraw-all-checkbox');
    const linkedAccountDisplay = document.getElementById('linked-account-display');
    const transactionPasswordInput = document.getElementById('transactionPassword');
    const actualAmountDisplay = document.getElementById('actualAmount');
    const withdrawForm = document.getElementById('withdraw-form');
    const historyFab = document.getElementById('history-fab');
    const historyModal = document.getElementById('history-modal');
    const closeHistoryModalButton = document.getElementById('close-history-modal');
    const transactionsList = document.getElementById('transactions-list');

    const WITHDRAW_FEE_PERCENTAGE = 0.05; // Define a taxa de saque em 5%

    let currentBalance = 0;

    async function loadWithdrawData() {
        showLoading(true);
        try {
            // *** O URL DO BACKEND AGORA É O NODE.JS ***
            const userResponse = await fetch('http://localhost:5000/api/dashboard', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${userToken}`
                }
            });
            const userData = await userResponse.json();

            if (userResponse.ok) {
                currentBalance = parseFloat(userData.balance_withdraw || 0);
                if (currentWithdrawBalanceDisplay) {
                    currentWithdrawBalanceDisplay.innerText = `Kz ${currentBalance.toFixed(2).replace('.', ',')}`;
                }

                const rechargeBalance = parseFloat(userData.balance_recharge || 0);
                if (currentRechargeBalanceDisplay) {
                    currentRechargeBalanceDisplay.innerText = `Kz ${rechargeBalance.toFixed(2).replace('.', ',')}`;
                }

                if (linkedAccountDisplay) {
                    const bankName = userData.linked_account_bank_name;
                    const accountNumber = userData.linked_account_number;
                    const accountHolder = userData.linked_account_holder;

                    if (bankName && accountNumber) {
                        linkedAccountDisplay.innerHTML = `
                            <p><strong>${bankName}</strong></p>
                            <p>IBAN: ${accountNumber}</p>
                            <p>Titular: ${accountHolder || 'N/A'}</p>
                            <a href="/vincular conta.html" class="link-button">Alterar Conta</a>
                        `;
                    } else {
                        linkedAccountDisplay.innerHTML = `
                            <p>Nenhuma conta bancária vinculada.</p>
                            <a href="/vincular conta.html" class="link-button">Vincular Agora</a>
                        `;
                    }
                }
            } else {
                showMessage('Erro ao carregar dados: ' + (userData.error || userData.message || 'Erro desconhecido.'));
                if (userResponse.status === 401 || userResponse.status === 403) {
                    setTimeout(() => { window.location.href = '/Login.html'; }, 2000);
                }
            }
        } catch (error) {
            console.error('Erro ao carregar dados na página de saque:', error);
            showMessage('Não foi possível conectar ao servidor para obter os dados.');
        } finally {
            showLoading(false);
        }
    }

    await loadWithdrawData();

    if (withdrawAllCheckbox && withdrawAmountInput && actualAmountDisplay) {
        withdrawAllCheckbox.addEventListener('change', () => {
            if (withdrawAllCheckbox.checked) {
                withdrawAmountInput.value = currentBalance.toFixed(2);
                withdrawAmountInput.disabled = true;
            } else {
                withdrawAmountInput.value = '';
                withdrawAmountInput.disabled = false;
            }
            withdrawAmountInput.dispatchEvent(new Event('input'));
        });
    }

    if (withdrawAmountInput && actualAmountDisplay) {
        withdrawAmountInput.addEventListener('input', () => {
            let amount = parseFloat(withdrawAmountInput.value);
            if (isNaN(amount) || amount <= 0) {
                actualAmountDisplay.innerText = 'Kz 0.00';
                return;
            }
            const actualAmount = amount * (1 - WITHDRAW_FEE_PERCENTAGE);
            actualAmountDisplay.innerText = `Kz ${actualAmount.toFixed(2).replace('.', ',')}`;
        });
    }

    if (withdrawForm) {
        withdrawForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            showLoading(true);

            let amount = parseFloat(withdrawAmountInput.value);
            const transactionPassword = transactionPasswordInput.value;

            if (isNaN(amount) || amount <= 0) {
                showMessage('Por favor, insira um valor de saque válido e positivo.');
                showLoading(false);
                return;
            }
            if (amount > currentBalance) {
                showMessage(`O valor solicitado (Kz ${amount.toFixed(2).replace('.', ',')}) é maior do que o saldo disponível (Kz ${currentBalance.toFixed(2).replace('.', ',')}).`);
                showLoading(false);
                return;
            }
            const linkedAccountInfoElement = document.getElementById('linked-account-display');
            if (linkedAccountInfoElement && linkedAccountInfoElement.innerHTML.includes('Nenhuma conta bancária vinculada')) {
                showMessage('Por favor, vincule uma conta bancária antes de tentar sacar.', true);
                showLoading(false);
                return;
            }

            if (!transactionPassword) {
                showMessage('Por favor, insira a sua senha de transação.');
                showLoading(false);
                return;
            }

            try {
                // *** O URL DO BACKEND AGORA É O NODE.JS ***
                const response = await fetch('http://localhost:5000/api/withdraw', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${userToken}`
                    },
                    body: JSON.stringify({
                        withdrawAmount: amount,
                        transactionPassword: transactionPassword
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    showMessage(data.message);
                    await loadWithdrawData();
                    withdrawAmountInput.value = ''; 
                    transactionPasswordInput.value = '';
                    actualAmountDisplay.innerText = 'Kz 0.00'; 
                    if (withdrawAllCheckbox) withdrawAllCheckbox.checked = false; 
                    withdrawAmountInput.disabled = false;
                } else {
                    showMessage('Erro no saque: ' + (data.error || data.message || 'Erro desconhecido.'), true);
                    if (response.status === 401 || response.status === 403) {
                        setTimeout(() => { window.location.href = '/Login.html'; }, 2000);
                    }
                }
            } catch (error) {
                console.error('Erro na requisição de saque:', error);
                showMessage('Não foi possível conectar ao servidor ou houve um erro inesperado.', true);
            } finally {
                showLoading(false);
            }
        });
    }

    if (historyFab) {
        historyFab.addEventListener('click', async () => {
            showLoading(true);
            try {
                // *** O URL DO BACKEND AGORA É O NODE.JS ***
                const response = await fetch('http://localhost:5000/api/withdrawals/history', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${userToken}`,
                        'Content-Type': 'application/json'
                    }
                });
                const data = await response.json();

                if (response.ok) {
                    if (historyModal) historyModal.style.display = 'flex';
                    if (transactionsList) {
                        transactionsList.innerHTML = '';
                        if (data.history && data.history.length > 0) {
                            data.history.forEach(transaction => {
                                const listItem = document.createElement('li');
                                listItem.classList.add('transaction-item');
                                listItem.innerHTML = `
                                    <span>Tipo: Saque</span>
                                    <span>Valor Solicitado: <strong>Kz ${parseFloat(transaction.requested_amount).toFixed(2).replace('.', ',')}</strong></span>
                                    <span>Taxa: Kz ${parseFloat(transaction.fee).toFixed(2).replace('.', ',')}</span>
                                    <span>Valor Real Recebido: <strong>Kz ${parseFloat(transaction.actual_amount).toFixed(2).replace('.', ',')}</strong></span>
                                    <span>Status: ${transaction.status}</span>
                                    <span>Data: ${new Date(transaction.timestamp).toLocaleString('pt-PT')}</span>
                                    ${transaction.account_number_used ? `<span>Conta: ${transaction.account_number_used}</span>` : ''}
                                `;
                                transactionsList.appendChild(listItem);
                            });
                        } else {
                            const noTransactionsItem = document.createElement('li');
                            noTransactionsItem.classList.add('transaction-item', 'placeholder-item');
                            noTransactionsItem.innerText = 'Nenhuma transação de saque encontrada.';
                            transactionsList.appendChild(noTransactionsItem);
                        }
                    }
                } else {
                    showMessage('Erro ao carregar histórico de saques: ' + (data.error || data.message || 'Erro desconhecido.'));
                }
            } catch (error) {
                console.error('Erro de rede ao carregar histórico de saques:', error);
                showMessage('Não foi possível conectar ao servidor para obter o histórico de saques.');
            } finally {
                showLoading(false);
            }
        });
    }

    if (closeHistoryModalButton && historyModal) {
        closeHistoryModalButton.addEventListener('click', () => {
            historyModal.style.display = 'none';
        });
    }

    if (historyModal) {
        historyModal.addEventListener('click', (event) => {
            if (event.target === historyModal) {
                historyModal.style.display = 'none';
            }
        });
    }
});
