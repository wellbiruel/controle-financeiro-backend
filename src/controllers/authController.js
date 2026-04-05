const userModel = require('../models/userModel');
const { hashPassword, comparePassword } = require('../utils/passwordUtils');
const { generateToken } = require('../utils/jwtUtils');

async function register(req, res) {
  const { email, senha, nome } = req.body;
  if (!email || !senha) {
    return res.status(400).json({ message: 'Email e senha são obrigatórios.' });
  }
  try {
    const existingUser = await userModel.findUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ message: 'Email já cadastrado.' });
    }
    const passwordHash = await hashPassword(senha);
    const newUser = await userModel.createUser(email, passwordHash, nome);
    const token = generateToken(newUser.id);
    res.status(201).json({ message: 'Usuário criado com sucesso!', token, user: { id: newUser.id, email: newUser.email, nome: newUser.nome } });
  } catch (error) {
    console.error('Erro ao registrar:', error);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
}

async function login(req, res) {
  const { email, senha } = req.body;
  if (!email || !senha) {
    return res.status(400).json({ message: 'Email e senha são obrigatórios.' });
  }
  try {
    const user = await userModel.findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ message: 'Credenciais inválidas.' });
    }
    const isPasswordValid = await comparePassword(senha, user.senha_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Credenciais inválidas.' });
    }
    const token = generateToken(user.id);
    res.status(200).json({ message: 'Login realizado com sucesso!', token, user: { id: user.id, email: user.email, nome: user.nome } });
  } catch (error) {
    console.error('Erro ao fazer login:', error);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
}

module.exports = { register, login };