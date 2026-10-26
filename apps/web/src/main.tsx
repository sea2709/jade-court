import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './context/AuthProvider';
import { HomeScreen } from './screens/HomeScreen';
import { LearnRedirect } from './screens/LearnRedirect';
import { MultiplayerScreen } from './screens/MultiplayerScreen';
import { PlayScreen } from './screens/PlayScreen';
import { PlayAiScreen } from './screens/PlayAiScreen';
import { NewsScreen } from './screens/NewsScreen';
import { LoginScreen } from './screens/LoginScreen';
import { RegisterScreen } from './screens/RegisterScreen';
import { AccountScreen } from './screens/AccountScreen';
import { DataDeletionStatusScreen } from './screens/DataDeletionStatusScreen';
import { ForgotPasswordScreen } from './screens/ForgotPasswordScreen';
import { RegisterSentScreen } from './screens/RegisterSentScreen';
import { ResetPasswordScreen } from './screens/ResetPasswordScreen';
import { VerifyEmailScreen } from './screens/VerifyEmailScreen';
import { AdminLayout } from './admin/AdminLayout';
import { AdminDashboardScreen } from './screens/AdminDashboardScreen';
import { AdminLoginScreen } from './screens/AdminLoginScreen';
import { AdminNewsScreen } from './screens/AdminNewsScreen';
import { AdminUsersScreen } from './screens/AdminUsersScreen';
import { AdminPaymentsScreen } from './screens/AdminPaymentsScreen';
import './index.css';
import { applyTheme } from './lib/theme';

applyTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/admin/login" element={<AdminLoginScreen />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboardScreen />} />
            <Route path="news" element={<AdminNewsScreen />} />
            <Route path="users" element={<AdminUsersScreen />} />
            <Route path="payments" element={<AdminPaymentsScreen />} />
          </Route>
          <Route path="/" element={<App />}>
            <Route index element={<HomeScreen />} />
            <Route path="learn" element={<LearnRedirect />} />
            <Route path="play" element={<PlayScreen />} />
            <Route path="play-ai" element={<PlayAiScreen />} />
            <Route path="multiplayer" element={<MultiplayerScreen />} />
            <Route path="news" element={<NewsScreen />} />
            <Route path="login" element={<LoginScreen />} />
            <Route path="register" element={<RegisterScreen />} />
            <Route path="register/sent" element={<RegisterSentScreen />} />
            <Route path="verify-email" element={<VerifyEmailScreen />} />
            <Route path="forgot-password" element={<ForgotPasswordScreen />} />
            <Route path="reset-password" element={<ResetPasswordScreen />} />
            <Route path="account" element={<AccountScreen />} />
            <Route path="account/data-deletion" element={<DataDeletionStatusScreen />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
