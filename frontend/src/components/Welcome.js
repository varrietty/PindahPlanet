import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";


/* S */
const Welcome = () => {
  const navigate = useNavigate();
  useEffect(() => {
    try {
      const adsbygoogle = window.adsbygoogle || [];
      adsbygoogle.push({});
      adsbygoogle.push({});
    } catch (e) {
      console.error("AdSense error:", e);
    }
  }, []);

  return (
    <div className="welcome-container">
      <h1>Selamat Datang!</h1>
      <p>
        Kamu mempunyai <strong>3 detik atau dapat disesuaikan</strong> untuk setiap shot – no retakes! <br />
        Photobooth ini mengambil <strong>4 gambar</strong> jadi pose yang terbaik dan bersenang-senang
      </p>
      <p>
        Setelah selesai, <span style={{ color: "light blue" }}></span> kamu bisa mendownload hasil fotonya
      </p>
      <button onClick={() => navigate("/photobooth")}>MULAI</button>

      {/* ads side by side */}
      <div className="side-by-side-ads" style={{ 
        display: "flex", 
        flexDirection: "row", 
        flexWrap: "wrap", 
        justifyContent: "center",
        gap: "20px",
        marginTop: "30px", 
        width: "100%" 
      }}>

      {/* Google AdSense Ad Unit */}
      <div className="ad-container" style={{ flex: "1", minWidth: "300px",  maxWidth: "100%" }}>
        <ins className="adsbygoogle"
          style={{ display: "block" }}
          data-ad-client="ca-pub-7810675993668366"
          data-ad-slot="4993591788"
          data-ad-format="auto"
          data-full-width-responsive="true"></ins>
     </div>

      <div className="ad-container" style={{ flex: "1", minWidth: "300px",  maxWidth: "100%" }}>
        <ins className="adsbygoogle"
          style={{ display: "block" }}
          data-ad-client="ca-pub-7810675993668366"
          data-ad-slot="5843876703"
          data-ad-format="auto"
          data-full-width-responsive="true"></ins>
      </div>
    </div>
    </div>
  );
};

export default Welcome;
