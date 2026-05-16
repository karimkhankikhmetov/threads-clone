import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const navItem = "p-3 rounded-full hover:bg-zinc-800 transition-colors";
  const activeItem = "p-3 rounded-full bg-zinc-800";

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top nav */}
      <header className="sticky top-0 z-30 backdrop-blur bg-black/70 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto flex items-center justify-between px-4 h-14">
          <Link to="/" className="text-2xl font-bold tracking-tight">threads</Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={({isActive}) => isActive ? activeItem : navItem} title="Home">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H10v7H6a2 2 0 0 1-2-2v-9z"/></svg>
            </NavLink>
            <NavLink to="/explore" className={({isActive}) => isActive ? activeItem : navItem} title="Explore">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            </NavLink>
            <NavLink to="/search" className={({isActive}) => isActive ? activeItem : navItem} title="Search users">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>
            </NavLink>
            {user ? (
              <>
                <NavLink to={`/u/${user.username}`} className={({isActive}) => isActive ? activeItem : navItem} title="Profile">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </NavLink>
                <button onClick={() => { logout(); navigate("/login"); }} className={navItem} title="Logout">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
                </button>
              </>
            ) : (
              <Link to="/login" className="px-4 py-1.5 rounded-full bg-white text-black text-sm font-semibold ml-2">Log in</Link>
            )}
          </nav>
        </div>
      </header>

      <main className="max-w-2xl mx-auto border-x border-zinc-800 min-h-[calc(100vh-3.5rem)]">
        {children}
      </main>
    </div>
  );
}
