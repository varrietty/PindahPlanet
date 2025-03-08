import React from "react";
import { useNavigate } from "react-router-dom";
import "../App.css";

/* A */
const Home = () => {
  const navigate = useNavigate();

  return (
    <div className="background-gradient h-screen flex  flex-col justify-center items-center text-center">
      <div className="home-container"> 
        <h1 className="text-5xl font-bold text-pink-600 mb-4">Pindah Planet</h1> 
        <p className="text-lg text-gray-700 mb-6">
          Selamat datang di pindahplanet photobooth! Ini adalah photobooth pribadi kamu di rumah.
        </p>     
        <div style={{ height: "20px" }}></div>

        <img src="/photobooth-strip.jpg" alt="photobooth strip" className="photobooth-strip"/>
        
        <button onClick={() => navigate("/welcome")} className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-pink-600 transition">
          MULAI
        </button>

        <footer className="mt-8 text-sm text-gray-600">
          <p>
            made by galhyung
            </p>
            <p>© 2025 Galhyung. All Rights Reserved.</p>
        </footer>
      </div>
    </div>
    );
  };

export default Home;
