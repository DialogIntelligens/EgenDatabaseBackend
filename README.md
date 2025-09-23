# Projektstruktur – Backend

Dette projekt er organiseret efter en lagdelt arkitektur, som giver en tydelig adskillelse af ansvar og gør systemet nemmere at vedligeholde og udvide.  

## 📂 src/
Alle kildekodefiler ligger i `src/`-mappen.  

### 📂 controllers/
Controllers fungerer som bindeled mellem **routes** og **services**.  
- Modtager HTTP-forespørgsler fra routes.  
- Validerer input og håndterer evt. fejl.  
- Kalder de relevante services for at udføre logikken.  
- Returnerer svar til klienten.  

### 📂 routes/
Routes definerer API-endpoints.  
- Bestemmer hvilke URL’er og HTTP-metoder (GET, POST, PUT, DELETE) der er tilgængelige.  
- Kalder de tilhørende controllers, når en forespørgsel rammer et endpoint.  

### 📂 services/
Services indeholder forretningslogikken.  
- Udfører den egentlige behandling af data (fx databasekald, beregninger, eksterne API-kald).  
- Holder controllere lette og simple.  
- Kan genbruges af flere controllere.  

### 📂 utils/
Utils indeholder generelle hjælpefunktioner.  
- Små, genbrugelige funktioner til fx datahåndtering, formattering eller transformation.  
- Kan anvendes af både services og controllers.  

---

## 🔄 Samspil mellem mapperne
1. En request rammer et **route** (fx `/api/...`).  
2. **Route** sender requesten videre til den relevante **controller**.  
3. **Controller** validerer input og kalder en **service** for at udføre logikken.  
4. **Service** kan bruge funktioner fra **utils** til at håndtere data.  
5. **Controller** returnerer resultatet til klienten.  


