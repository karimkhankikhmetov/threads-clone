import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth.jsx";
import Layout from "./components/Layout.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import Feed from "./pages/Feed.jsx";
import ThreadDetail from "./pages/ThreadDetail.jsx";
import Profile from "./pages/Profile.jsx";
import Search from "./pages/Search.jsx";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function Shell() {
  const { loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-500">
        Loading...
      </div>
    );
  }
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/" element={<Layout><Feed mode="explore" /></Layout>} />
      <Route path="/explore" element={<Layout><Feed mode="explore" /></Layout>} />
      <Route path="/search" element={<Layout><Search /></Layout>} />
      <Route path="/t/:id" element={<Layout><ThreadDetail /></Layout>} />
      <Route path="/u/:username" element={<Layout><Profile /></Layout>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
