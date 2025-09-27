-- Complete Chatbot Settings Table Refresh
-- Generated automatically from GitHub integration scripts
-- Generated on: 2025-09-27T21:19:48.893Z
-- Found 97 chatbot configurations

-- Step 1: Clear existing chatbot settings
DELETE FROM chatbot_settings;

-- Step 2: Reset the ID sequence
ALTER SEQUENCE chatbot_settings_id_seq RESTART WITH 1;

-- Step 3: Insert all chatbot configurations

-- Configuration 1: bevco
INSERT INTO chatbot_settings (chatbot_id, flow2_key, apiflow_key, pinecone_api_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, apiflow_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('bevco', 'product', 'order', 'pcsk_5jmBcT_PypcxuLpuC6aGqQtgLXeaM8Nt9GzPtqyBLtpeDATfZgMiDmVinhCJeLGV1zoPSK', 'bevco-alt', 'bevco-pro', 'bevco-alt', 'Hej 😊 Spørg mig om alt – lige fra produkter til generelle spørgsmål, ordrestatus, eller tips & tricks til drikkevarer og grej 🍹🍾', NOW(), NOW());

-- Configuration 2: skadedyrshop
INSERT INTO chatbot_settings (chatbot_id, flow2_key, flow3_key, pinecone_api_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, flow3_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('skadedyrshop', 'category', 'product', 'pcsk_61ikwk_TrrPrpagck8PLsqoc2aeTdhBZoMzRwPXP2Y1pTuw4zw7ewskEyC74Vh7yhcrFEN', 'hhs-alt1', 'hhs-links', 'hhs-produkter', 'Hej😊 Hvad kan jeg hjælpe dig med?🐝 (Du kan stille et spørgsmål, få anbefalet et produkt eller uploade et billede📷)', NOW(), NOW());

-- Configuration 3: Greencargear
INSERT INTO chatbot_settings (chatbot_id, flow3_key, knowledgebase_index_endpoint, flow3_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('Greencargear', 'product', 'greencargear-alt', 'greencargear-pro', 'Hej, mit navn er ELmer, jeg er GreenCarGears AI chatbot. Jeg kan hjælpe dig med produktspørgsmål eller generelle spørgsmål omkring vores webshop ⚡️', NOW(), NOW());

-- Configuration 4: noroff
INSERT INTO chatbot_settings (chatbot_id, flow3_key, first_message, created_at, updated_at)
VALUES ('noroff', 'product', 'Hei😊Hva kan jeg hjelpe deg med?', NOW(), NOW());

-- Configuration 5: afds
INSERT INTO chatbot_settings (chatbot_id, flow3_key, first_message, created_at, updated_at)
VALUES ('afds', 'product', 'Hej 😊 Spørg mig om alt – lige fra produkter til generelle spørgsmål, eller få personlige anbefalinger 🤖', NOW(), NOW());

-- Configuration 6: aiasound
INSERT INTO chatbot_settings (chatbot_id, knowledgebase_index_endpoint, first_message, created_at, updated_at)
VALUES ('aiasound', 'aiasound-alt', 'Spørg mig om hvad som helst - hvem der spiller, hvor du finder den vildeste vibe, eller bare hvad du ikke må misse 🔥 Jeg er din AI-wingwoman hele festen 🥳', NOW(), NOW());

-- Configuration 7: aida
INSERT INTO chatbot_settings (chatbot_id, flow3_key, pinecone_api_key, knowledgebase_index_endpoint, flow3_knowledgebase_index, apiflow_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('aida', 'product', 'pcsk_5DhXSe_3TDYCHkg8bdNL2PBgprKCbm1XeewQMnr84fsm18eMH7dgDxxrHKQhxntJduLELJ', 'aida', 'aida-pro', 'aida', 'Hej 😊 Spørg mig om alt – lige fra produkter til generelle spørgsmål, eller få personlige anbefalinger 🤖 \nDu er også altid velkommen til at kontakte vores menneskelige kundeservice, hvor vi bestræber os efter at svare indenfor 24 timer.', NOW(), NOW());

-- Configuration 8: americanwine
INSERT INTO chatbot_settings (chatbot_id, flow3_key, first_message, created_at, updated_at)
VALUES ('americanwine', 'product', 'Hej😊 har du brug for hjælp til at finde den rette vin?🍷', NOW(), NOW());

-- Configuration 9: bevcose
INSERT INTO chatbot_settings (chatbot_id, flow2_key, apiflow_key, pinecone_api_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, apiflow_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('bevcose', 'product', 'order', 'pcsk_5DhXSe_3TDYCHkg8bdNL2PBgprKCbm1XeewQMnr84fsm18eMH7dgDxxrHKQhxntJduLELJ', 'bevco-se', 'bevco-pro-se', 'bevco-se', 'Hej 😊 Fråga mig om vad som helst – allt från produkter till allmänna frågor, orderstatus eller tips & tricks om drycker och utrustning 🍹🍾', NOW(), NOW());

-- Configuration 10: bodylab
INSERT INTO chatbot_settings (chatbot_id, apiflow_key, created_at, updated_at)
VALUES ('bodylab', 'order', NOW(), NOW());

-- Configuration 11: bodylabfinland
INSERT INTO chatbot_settings (chatbot_id, apiflow_key, created_at, updated_at)
VALUES ('bodylabfinland', 'order', NOW(), NOW());

-- Configuration 12: bodylabnorge
INSERT INTO chatbot_settings (chatbot_id, apiflow_key, created_at, updated_at)
VALUES ('bodylabnorge', 'order', NOW(), NOW());

-- Configuration 13: bodylabsverige
INSERT INTO chatbot_settings (chatbot_id, apiflow_key, created_at, updated_at)
VALUES ('bodylabsverige', 'order', NOW(), NOW());

-- Configuration 14: bolighaven
INSERT INTO chatbot_settings (chatbot_id, flow3_key, pinecone_api_key, knowledgebase_index_endpoint, flow3_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('bolighaven', 'product', 'pcsk_5jmBcT_PypcxuLpuC6aGqQtgLXeaM8Nt9GzPtqyBLtpeDATfZgMiDmVinhCJeLGV1zoPSK', 'boligoghaven-alt', 'boligoghaven-pro', 'Hej 😊 Spørg mig om alt – lige fra produkter til generelle spørgsmål, jeg kan også søge for dig 🤖', NOW(), NOW());

-- Configuration 15: boozt
INSERT INTO chatbot_settings (chatbot_id, flow2_key, flow3_key, flow4_key, metadata_key, metadata2_key, pinecone_api_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, flow3_knowledgebase_index, flow4_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('boozt', 'beauty', 'product', 'productfilter', 'productfilter', 'beauty', 'pcsk_3UjrPD_31C2RmtD3gCJT257xMaBWDWfxQeCjSC3TFHJiU2hxzDu8uDVkjeSKRKDYDuwVS1', 'boozt-alt', 'beauty-pro', 'boozt-pro', 'boozt-pro', 'Hej 😊 Spørg mig om alt – lige fra produkter til generelle spørgsmål, eller få personlige anbefalinger 🤖', NOW(), NOW());

-- Configuration 16: cotonshoppen
INSERT INTO chatbot_settings (chatbot_id, flow3_key, first_message, created_at, updated_at)
VALUES ('cotonshoppen', 'product', 'Hej😊 Jeg er en demo, der kan hjælpe dig med at finde det rette hundetøj🐶', NOW(), NOW());

-- Configuration 17: crux
INSERT INTO chatbot_settings (chatbot_id, flow3_key, first_message, created_at, updated_at)
VALUES ('crux', 'product', 'Hei 😊 Hvordan kan jeg hjelpe deg?', NOW(), NOW());

-- Configuration 18: damask
INSERT INTO chatbot_settings (chatbot_id, flow2_key, pinecone_api_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, flow3_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('damask', 'product', 'pcsk_3UjrPD_31C2RmtD3gCJT257xMaBWDWfxQeCjSC3TFHJiU2hxzDu8uDVkjeSKRKDYDuwVS1', 'damask-alt', 'damask-pro', 'humac-pro', 'Hej 😊 Spørg mig om alt – lige fra produkter til generelle spørgsmål, eller få personlige anbefalinger ', NOW(), NOW());

-- Configuration 19: danishcrown
INSERT INTO chatbot_settings (chatbot_id, flow3_key, first_message, created_at, updated_at)
VALUES ('danishcrown', 'product', 'Hej 😊 Spørg mig om alt – lige fra produkter til generelle spørgsmål, eller få personlige anbefalinger 🥩', NOW(), NOW());

-- Configuration 20: dillingch
INSERT INTO chatbot_settings (chatbot_id, flow2_key, flow3_key, flow4_key, apiflow_key, metadata_key, pinecone_api_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, flow3_knowledgebase_index, flow4_knowledgebase_index, apiflow_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('dillingch', 'product', 'productnofilter', 'category', 'order', 'product', 'pcsk_2Pv6s6_B2XcjJmDsi7ZCYXqwph4wo18vsGQMTR7ThkWhQ36M5JuMWoKh4kAGG57KHnfXge', 'dillingch-faq', 'dillingch-pro', 'dillingch-pro', 'dillingch-kat', 'dillingch-faq', 'Hallo 😊 Ich bin der Chatbot von DILLING. \nWie kann ich Ihnen helfen?\n', NOW(), NOW());

-- Configuration 21: dillingde
INSERT INTO chatbot_settings (chatbot_id, flow2_key, flow3_key, flow4_key, apiflow_key, metadata_key, pinecone_api_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, flow3_knowledgebase_index, flow4_knowledgebase_index, apiflow_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('dillingde', 'product', 'productnofilter', 'category', 'order', 'product', 'pcsk_GNBAU_9Y2fpBkz3mhEpx6EYLZjov7rJd4DuMNg76vpm8fZqsvPK6rkFCdEPTwRh5YuRUh', 'dillingde-faq', 'dillingde-pro', 'dillingde-pro', 'dillingde-kat', 'dillingde-faq', 'Hallo 😊 Ich bin der Chatbot von DILLING. \nWie kann ich Ihnen helfen?\n', NOW(), NOW());

-- Configuration 22: dillingeu
INSERT INTO chatbot_settings (chatbot_id, flow2_key, flow3_key, flow4_key, apiflow_key, metadata_key, pinecone_api_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, flow3_knowledgebase_index, flow4_knowledgebase_index, apiflow_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('dillingeu', 'product', 'productnofilter', 'category', 'order', 'product', 'pcsk_GNBAU_9Y2fpBkz3mhEpx6EYLZjov7rJd4DuMNg76vpm8fZqsvPK6rkFCdEPTwRh5YuRUh', 'dillingeu-faq', 'dillingeu-pro', 'dillingeu-pro', 'dillingeu-kat', 'dillingeu-faq', 'Hi there 😊 I', NOW(), NOW());

-- Configuration 23: dillingfi
INSERT INTO chatbot_settings (chatbot_id, flow2_key, flow3_key, flow4_key, apiflow_key, metadata_key, pinecone_api_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, flow3_knowledgebase_index, flow4_knowledgebase_index, apiflow_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('dillingfi', 'product', 'productnofilter', 'category', 'order', 'product', 'pcsk_2Pv6s6_B2XcjJmDsi7ZCYXqwph4wo18vsGQMTR7ThkWhQ36M5JuMWoKh4kAGG57KHnfXge', 'dillingfi-faq', 'dillingfi-pro', 'dillingfi-pro', 'dillingfi-kat', 'dillingfi-faq', 'Hei 😊 Olen DILLINGin chattibotti. \nVoinko olla avuksi?\n', NOW(), NOW());

-- Configuration 24: dillingfr
INSERT INTO chatbot_settings (chatbot_id, flow2_key, flow3_key, apiflow_key, metadata_key, pinecone_api_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, flow3_knowledgebase_index, flow4_knowledgebase_index, apiflow_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('dillingfr', 'product', 'productnofilter', 'order', 'product', 'pcsk_GNBAU_9Y2fpBkz3mhEpx6EYLZjov7rJd4DuMNg76vpm8fZqsvPK6rkFCdEPTwRh5YuRUh', 'dillingfr-faq', 'dillingfr-pro', 'dillingfr-pro', 'dillingfr-kat', 'dillingfr-faq', 'Bonjour 😊 Je suis le chatbot de DILLING. \nComment puis-je vous aider?\n', NOW(), NOW());

-- Configuration 25: dillingnl
INSERT INTO chatbot_settings (chatbot_id, flow2_key, flow3_key, flow4_key, apiflow_key, metadata_key, pinecone_api_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, flow3_knowledgebase_index, flow4_knowledgebase_index, apiflow_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('dillingnl', 'product', 'productnofilter', 'category', 'order', 'product', 'pcsk_GNBAU_9Y2fpBkz3mhEpx6EYLZjov7rJd4DuMNg76vpm8fZqsvPK6rkFCdEPTwRh5YuRUh', 'dillingnl-faq', 'dillingnl-pro', 'dillingnl-pro', 'dillingnl-kat', 'dillingnl-faq', 'Hoi 😊 Ik ben de chatbot van DILLING. \nHoe kan ik je helpen?\n', NOW(), NOW());

-- Configuration 26: dillingno
INSERT INTO chatbot_settings (chatbot_id, flow2_key, flow3_key, flow4_key, apiflow_key, metadata_key, pinecone_api_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, flow3_knowledgebase_index, flow4_knowledgebase_index, apiflow_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('dillingno', 'product', 'productnofilter', 'category', 'order', 'product', 'pcsk_2Pv6s6_B2XcjJmDsi7ZCYXqwph4wo18vsGQMTR7ThkWhQ36M5JuMWoKh4kAGG57KHnfXge', 'dillingno-faq', 'dillingno-pro', 'dillingno-pro', 'dillingno-kat', 'dillingno-faq', 'Hei 😊 Jeg er DILLINGs chatbot. \nHva kan jeg hjelpe deg med?\n', NOW(), NOW());

-- Configuration 27: dillingse
INSERT INTO chatbot_settings (chatbot_id, flow2_key, flow3_key, flow4_key, apiflow_key, metadata_key, pinecone_api_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, flow3_knowledgebase_index, flow4_knowledgebase_index, apiflow_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('dillingse', 'product', 'productnofilter', 'category', 'order', 'product', 'pcsk_2Pv6s6_B2XcjJmDsi7ZCYXqwph4wo18vsGQMTR7ThkWhQ36M5JuMWoKh4kAGG57KHnfXge', 'dillingse-faq', 'dillingse-pro', 'dillingse-pro', 'dillingse-kat', 'dillingse-faq', 'Hej 😊 Jag är DILLING:s chattbot. \nHur kan jag hjälpa dig?\n', NOW(), NOW());

-- Configuration 28: dillinguk
INSERT INTO chatbot_settings (chatbot_id, flow2_key, flow3_key, flow4_key, apiflow_key, metadata_key, pinecone_api_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, flow3_knowledgebase_index, flow4_knowledgebase_index, apiflow_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('dillinguk', 'product', 'productnofilter', 'category', 'order', 'product', 'pcsk_GNBAU_9Y2fpBkz3mhEpx6EYLZjov7rJd4DuMNg76vpm8fZqsvPK6rkFCdEPTwRh5YuRUh', 'dillinguk-faq', 'dillinguk-pro', 'dillinguk-pro', 'dillinguk-kat', 'dillinguk-faq', 'Hi there 😊 I', NOW(), NOW());

-- Configuration 29: dillingus
INSERT INTO chatbot_settings (chatbot_id, flow2_key, flow3_key, flow4_key, apiflow_key, metadata_key, pinecone_api_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, flow3_knowledgebase_index, flow4_knowledgebase_index, apiflow_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('dillingus', 'product', 'productnofilter', 'category', 'order', 'product', 'pcsk_GNBAU_9Y2fpBkz3mhEpx6EYLZjov7rJd4DuMNg76vpm8fZqsvPK6rkFCdEPTwRh5YuRUh', 'dillingus-faq', 'dillingus-pro', 'dillingus-pro', 'dillingus-kat', 'dillingus-faq', 'Hi there 😊 I', NOW(), NOW());

-- Configuration 30: dillingdk
INSERT INTO chatbot_settings (chatbot_id, flow2_key, flow3_key, apiflow_key, metadata_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, flow3_knowledgebase_index, flow4_knowledgebase_index, apiflow_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('dillingdk', 'product', 'productnofilter', 'order', 'product', 'dilling-faq', 'dilling-pro', 'dilling-pro', 'dilling-kat', 'dilling-faq', 'Hej med dig 🙂 Jeg er DILLINGs chatbot. Hvordan kan jeg hjælpe dig?', NOW(), NOW());

-- Configuration 31: ditur
INSERT INTO chatbot_settings (chatbot_id, flow3_key, flow4_key, apiflow_key, metadata_key, pinecone_api_key, knowledgebase_index_endpoint, flow3_knowledgebase_index, flow4_knowledgebase_index, apiflow_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('ditur', 'product', 'productfilter', 'order', 'productfilter', 'pcsk_6DGzau_SeHjbfsoGMME27Xm9PLKbuQoTMZpA6LHbbYih45v3ybkKeHcxm2fQEzuN3XWMgf', 'ditur-alt', 'ditur-pro', 'ditur-pro', 'ditur-alt', 'Hej 😊 Spørg mig om alt – lige fra produkter til generelle spørgsmål, eller få personlige anbefalinger 🤖', NOW(), NOW());

-- Configuration 32: dktrimmer
INSERT INTO chatbot_settings (chatbot_id, flow2_key, flow3_key, apiflow_key, pinecone_api_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, flow3_knowledgebase_index, apiflow_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('dktrimmer', 'product', 'models', 'order', 'pcsk_5jmBcT_PypcxuLpuC6aGqQtgLXeaM8Nt9GzPtqyBLtpeDATfZgMiDmVinhCJeLGV1zoPSK', 'dktrimmer-alt', 'dktrimmer-pro', 'dktrimmer-spe', 'dktrimmer-alt', 'Hej 😊 Spørg mig om alt – lige fra produkter til generelle spørgsmål, eller få personlige anbefalinger 🤖 Jeg kan også se hvilke ukrudtsbørster, der passer på din model.', NOW(), NOW());

-- Configuration 33: sda
INSERT INTO chatbot_settings (chatbot_id, flow3_key, first_message, created_at, updated_at)
VALUES ('sda', 'product', 'Hej 😊 Spørg mig om alt – lige fra produkter til generelle spørgsmål, eller få personlige anbefalinger 🤖', NOW(), NOW());

-- Configuration 34: dtu
INSERT INTO chatbot_settings (chatbot_id, flow3_key, pinecone_api_key, knowledgebase_index_endpoint, first_message, created_at, updated_at)
VALUES ('dtu', 'product', 'pcsk_5DhXSe_3TDYCHkg8bdNL2PBgprKCbm1XeewQMnr84fsm18eMH7dgDxxrHKQhxntJduLELJ', 'dtu-alt', 'Hej 😊 Spørg mig om alt – lige fra kurser til generelle spørgsmål, eller få personlige anbefalinger 🤖', NOW(), NOW());

-- Configuration 35: ejendrom
INSERT INTO chatbot_settings (chatbot_id, flow3_key, pinecone_api_key, knowledgebase_index_endpoint, flow3_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('ejendrom', 'product', 'pcsk_5jmBcT_PypcxuLpuC6aGqQtgLXeaM8Nt9GzPtqyBLtpeDATfZgMiDmVinhCJeLGV1zoPSK', 'ejendrom-alt', 'ejendrom-alt', 'Hej! Spørg mig om boliger, vurdering, eller få hjælp til at finde den rette bolig for dig 🏠😊', NOW(), NOW());

-- Configuration 36: fluenet
INSERT INTO chatbot_settings (chatbot_id, flow3_key, knowledgebase_index_endpoint, flow3_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('fluenet', 'product', 'fluenet-alt', 'fluenet-alt', 'Hej 😊 Jeg kan hjælpe dig med spørgsmål om vores løsninger🪰', NOW(), NOW());

-- Configuration 37: frydensberg
INSERT INTO chatbot_settings (chatbot_id, pinecone_api_key, knowledgebase_index_endpoint, first_message, created_at, updated_at)
VALUES ('frydensberg', 'pcsk_t4xAk_H8wDYbReN7o4WUTjziM8q5L9hX1dDkactXPfN7XxrYpRj7VNS4jXRgo32GeyiPM', 'frydensberg-alt', 'Hej😊 Sig endelig til hvis du har et spørgsmål!🙋🏼‍♂️', NOW(), NOW());

-- Configuration 38: fynspsy
INSERT INTO chatbot_settings (chatbot_id, pinecone_api_key, knowledgebase_index_endpoint, flow3_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('fynspsy', 'pcsk_2Pv6s6_B2XcjJmDsi7ZCYXqwph4wo18vsGQMTR7ThkWhQ36M5JuMWoKh4kAGG57KHnfXge', 'fynspsy-alt', 'fynspsy-pro', 'Hej 😊 \nJeg er din 24/7 support og kan hjælpe med dine mest overordnede spørgsmål uden for vores åbningstid. \nDu kan spørge mig om alt lige fra priser til ventetider, og jeg kan forsøge at finde det rette psykolog match til dig, hvis du ønsker det.', NOW(), NOW());

-- Configuration 39: gardinexperten
INSERT INTO chatbot_settings (chatbot_id, pinecone_api_key, knowledgebase_index_endpoint, first_message, created_at, updated_at)
VALUES ('gardinexperten', 'pcsk_5DhXSe_3TDYCHkg8bdNL2PBgprKCbm1XeewQMnr84fsm18eMH7dgDxxrHKQhxntJduLELJ', 'gardinexperten', 'Hej 😊 Spørg mig om alt – lige fra produkter til generelle spørgsmål, eller få personlige anbefalinger 🤖', NOW(), NOW());

-- Configuration 40: gavefabrikken
INSERT INTO chatbot_settings (chatbot_id, flow3_key, knowledgebase_index_endpoint, flow3_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('gavefabrikken', 'product', 'gavefabrikken-alt', 'gavefabrikken-pro', 'Hej 😊 Spørg mig om alt – lige fra produkter til generelle spørgsmål 🤖', NOW(), NOW());

-- Configuration 41: gugplanteskole
INSERT INTO chatbot_settings (chatbot_id, flow3_key, pinecone_api_key, knowledgebase_index_endpoint, flow3_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('gugplanteskole', 'product', 'pcsk_6DGzau_SeHjbfsoGMME27Xm9PLKbuQoTMZpA6LHbbYih45v3ybkKeHcxm2fQEzuN3XWMgf', 'gugplanteskole-alt', 'gugplanteskole-pro', 'Hej 🌿 Jeg er Gro – din AI-gartner hos Gug Planteskole. Spørg mig om alt fra planter, gødning, beskæring og plantesygdomme til meget mere – jeg finder svar fra vores hjemmeside. Kan jeg ikke hjælpe, kan du kontakte mine menneske-kollegaer 📞', NOW(), NOW());

-- Configuration 42: haengekoejer
INSERT INTO chatbot_settings (chatbot_id, flow3_key, pinecone_api_key, knowledgebase_index_endpoint, flow3_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('haengekoejer', 'product', 'pcsk_2buCaw_MZpZhKjhqorEq278kAhzVN64dd6mwbHh3ai4VNfzhSnWw6qApuuiVWG25dCBjtV', 'hk-alt', 'hk-alt', 'Hej😊 Jeg kan besvare spørgsmål og anbefale produkter. Hvad kan jeg hjælpe dig med?', NOW(), NOW());

-- Configuration 43: egenhjemmeside
INSERT INTO chatbot_settings (chatbot_id, flow2_key, flow3_key, first_message, created_at, updated_at)
VALUES ('egenhjemmeside', 'shhdsahfdshfds', 'sdfdsfds', 'Hej😊 Hvad kan jeg hjælpe dig med?🤖', NOW(), NOW());

-- Configuration 44: humac
INSERT INTO chatbot_settings (chatbot_id, flow3_key, pinecone_api_key, knowledgebase_index_endpoint, flow3_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('humac', 'product', 'pcsk_6DGzau_SeHjbfsoGMME27Xm9PLKbuQoTMZpA6LHbbYih45v3ybkKeHcxm2fQEzuN3XWMgf', 'humac-alt', 'humac-pro', 'Hej 😊 Spørg mig om alt – lige fra produkter til generelle spørgsmål, eller få personlige anbefalinger 🤖', NOW(), NOW());

-- Configuration 45: idekassen
INSERT INTO chatbot_settings (chatbot_id, flow2_key, first_message, created_at, updated_at)
VALUES ('idekassen', 'materials', 'Hej 😊 Spørg mig om alt – lige fra materialer til generelle spørgsmål, eller få personlige råd og anbefalinger til alle vores materialer.', NOW(), NOW());

-- Configuration 46: imagetest
INSERT INTO chatbot_settings (chatbot_id, flow2_key, flow3_key, first_message, created_at, updated_at)
VALUES ('imagetest', 'category', 'product', 'Hej😊 Hvad kan jeg hjælpe dig med?🐝', NOW(), NOW());

-- Configuration 47: jagtogvildt
INSERT INTO chatbot_settings (chatbot_id, flow3_key, pinecone_api_key, knowledgebase_index_endpoint, flow3_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('jagtogvildt', 'product', 'pcsk_t4xAk_H8wDYbReN7o4WUTjziM8q5L9hX1dDkactXPfN7XxrYpRj7VNS4jXRgo32GeyiPM', 'jagtogvildt-alt', 'jagtogvildt-pro', 'Hej😊 Hvad kan jeg hjælpe dig med? Alt fra produkt spørgsmål til anbefalinger🦌', NOW(), NOW());

-- Configuration 48: jagttegnkurser
INSERT INTO chatbot_settings (chatbot_id, pinecone_api_key, knowledgebase_index_endpoint, first_message, created_at, updated_at)
VALUES ('jagttegnkurser', 'pcsk_2buCaw_MZpZhKjhqorEq278kAhzVN64dd6mwbHh3ai4VNfzhSnWw6qApuuiVWG25dCBjtV', 'jagttegn', 'Hej😊 Hvad kan jeg hjælpe dig med?🫎', NOW(), NOW());

-- Configuration 49: kirurgiklinik
INSERT INTO chatbot_settings (chatbot_id, knowledgebase_index_endpoint, first_message, created_at, updated_at)
VALUES ('kirurgiklinik', 'kirurgiklinik', 'Hejsa 😊 Spørg mig om alt – lige fra behandling, vejledning til generelle spørgsmål 🦷 Jeg ved utrolig mange ting og vil hellere end gerne hjælpe dig.', NOW(), NOW());

-- Configuration 50: kongenskoreskole
INSERT INTO chatbot_settings (chatbot_id, flow2_key, flow3_key, pinecone_api_key, knowledgebase_index_endpoint, first_message, created_at, updated_at)
VALUES ('kongenskoreskole', 'sadsads', 'asdsad', 'pcsk_2Pv6s6_B2XcjJmDsi7ZCYXqwph4wo18vsGQMTR7ThkWhQ36M5JuMWoKh4kAGG57KHnfXge', 'kongen-alt', 'Hej😊 Hvad kan jeg hjælpe dig med?🚗 Kan besvare næsten alle dine sprøgsmål 🤖', NOW(), NOW());

-- Configuration 51: koreskolenpaatoppen
INSERT INTO chatbot_settings (chatbot_id, knowledgebase_index_endpoint, first_message, created_at, updated_at)
VALUES ('koreskolenpaatoppen', 'koreskolenpaatoppen', 'Hej 😊 Spørg mig om alt – lige fra pakker og køretøjer til generelle spørgsmål, eller få personlig vejledning 🚖', NOW(), NOW());

-- Configuration 52: kystfisken
INSERT INTO chatbot_settings (chatbot_id, flow2_key, flow3_key, first_message, created_at, updated_at)
VALUES ('kystfisken', 'qproduct', 'rproduct', 'Hej😊 Kan jeg hjælpe med at besvare et spørgsmål eller anbefale en fisk?🐟', NOW(), NOW());

-- Configuration 53: linaa
INSERT INTO chatbot_settings (chatbot_id, flow3_key, flow4_key, metadata_key, knowledgebase_index_endpoint, flow3_knowledgebase_index, flow4_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('linaa', 'product', 'productfilter', 'productfilter', 'linaa-alt', 'linaa-pro', 'linaa-pro', 'Hej! Jeg er din AI-hjælper hos Linå 🤖. \n\nSpørg om produkter (varenr.), materialer, værktøj, guides eller råd til dit projekt – hjemme eller til undervisning. \n\nJeg lærer løbende og henter hjælp fra kundeservice, hvis nødvendigt.', NOW(), NOW());

-- Configuration 54: localliving
INSERT INTO chatbot_settings (chatbot_id, flow2_key, flow3_key, metadata_key, first_message, created_at, updated_at)
VALUES ('localliving', 'productnofilter', 'product', 'product', 'Hej😊 Hvad kan jeg hjælpe dig med?☀️', NOW(), NOW());

-- Configuration 55: vibholm
INSERT INTO chatbot_settings (chatbot_id, flow3_key, flow4_key, apiflow_key, metadata_key, pinecone_api_key, knowledgebase_index_endpoint, flow3_knowledgebase_index, flow4_knowledgebase_index, apiflow_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('vibholm', 'product', 'productfilter', 'order', 'productfilter', 'pcsk_6DGzau_SeHjbfsoGMME27Xm9PLKbuQoTMZpA6LHbbYih45v3ybkKeHcxm2fQEzuN3XWMgf', 'vibholm-alt', 'vibholm-pro', 'vibholm-pro', 'vibholm-alt', 'Hej, mit navn er Vibe, jeg er Vibholms AI chatbot 😊 \nSpørg mig om alt – lige fra produkter til generelle spørgsmål, eller få personlige anbefalinger 👋', NOW(), NOW());

-- Configuration 56: vinhuset
INSERT INTO chatbot_settings (chatbot_id, flow3_key, flow4_key, apiflow_key, metadata_key, pinecone_api_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, flow3_knowledgebase_index, flow4_knowledgebase_index, apiflow_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('vinhuset', 'product', 'productfilter', 'order', 'productfilter', 'pcsk_6DGzau_SeHjbfsoGMME27Xm9PLKbuQoTMZpA6LHbbYih45v3ybkKeHcxm2fQEzuN3XWMgf', 'vinhuset-alt', 'vinhuset-alt', 'vinhuset-pro', 'vinhuset-pro', 'vinhuset-alt', 'Hej 😊 Spørg mig om alt – lige fra produkter til generelle spørgsmål, ordrestatus, eller tips & tricks til drikkevarer og grej 🍾🍷', NOW(), NOW());

-- Configuration 57: luxplus
INSERT INTO chatbot_settings (chatbot_id, flow2_key, flow3_key, flow4_key, apiflow_key, metadata_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, flow3_knowledgebase_index, flow4_knowledgebase_index, apiflow_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('luxplus', 'product', 'productnofilter', 'category', 'order', 'product', 'dilling-faq', 'dilling-pro', 'dilling-pro', 'dilling-kat', 'dilling-faq', 'Hej, jeg er Luxplus', NOW(), NOW());

-- Configuration 58: marienlyst
INSERT INTO chatbot_settings (chatbot_id, pinecone_api_key, knowledgebase_index_endpoint, first_message, created_at, updated_at)
VALUES ('marienlyst', 'pcsk_5DhXSe_3TDYCHkg8bdNL2PBgprKCbm1XeewQMnr84fsm18eMH7dgDxxrHKQhxntJduLELJ', 'marienlyst-alt', 'Hej 😊 Spørg mig om alt – lige fra ophold og gastronomi til generelle spørgsmål, eller få personlige anbefalinger 🧖', NOW(), NOW());

-- Configuration 59: masai
INSERT INTO chatbot_settings (chatbot_id, flow2_key, pinecone_api_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, flow3_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('masai', '2', 'pcsk_3UjrPD_31C2RmtD3gCJT257xMaBWDWfxQeCjSC3TFHJiU2hxzDu8uDVkjeSKRKDYDuwVS1', 'masai-alt', 'masai-pro', 'humac-pro', 'Hi 😊 Ask me anything – from products to general questions, or get personal recommendations 🤖', NOW(), NOW());

-- Configuration 60: masaifast
INSERT INTO chatbot_settings (chatbot_id, flow2_key, pinecone_api_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, flow3_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('masaifast', '2', 'pcsk_3UjrPD_31C2RmtD3gCJT257xMaBWDWfxQeCjSC3TFHJiU2hxzDu8uDVkjeSKRKDYDuwVS1', 'masai-alt', 'masai-pro', 'humac-pro', 'Hi 😊 Ask me anything – from products to general questions, or get personal recommendations 🤖', NOW(), NOW());

-- Configuration 61: mayafreya
INSERT INTO chatbot_settings (chatbot_id, flow3_key, knowledgebase_index_endpoint, flow3_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('mayafreya', 'product', 'mayafreya-alt', 'mayafreya-pro', 'Hej 😊\\n\\nJeg er Freya. Spørg mig om alt – lige fra produkter til generelle spørgsmål, eller få personlige anbefalinger 🤖', NOW(), NOW());

-- Configuration 62: mundret
INSERT INTO chatbot_settings (chatbot_id, pinecone_api_key, knowledgebase_index_endpoint, first_message, created_at, updated_at)
VALUES ('mundret', 'pcsk_5jmBcT_PypcxuLpuC6aGqQtgLXeaM8Nt9GzPtqyBLtpeDATfZgMiDmVinhCJeLGV1zoPSK', 'mundret-alt', 'Hej 😊 Spørg mig om alt – lige fra retter og koncept til generelle spørgsmål, eller endda personlige anbefalinger 🥘', NOW(), NOW());

-- Configuration 63: naturbutikken
INSERT INTO chatbot_settings (chatbot_id, flow3_key, flow4_key, metadata_key, knowledgebase_index_endpoint, flow3_knowledgebase_index, flow4_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('naturbutikken', 'product', 'productfilter', 'productfilter', 'naturbutikken-alt', 'naturbutikken-pro', 'naturbutikken-pro', 'Hej 😊 Spørg mig om alt – lige fra produkter til generelle spørgsmål, eller få personlige anbefalinger 🤖', NOW(), NOW());

-- Configuration 64: naturmand
INSERT INTO chatbot_settings (chatbot_id, flow3_key, pinecone_api_key, knowledgebase_index_endpoint, flow3_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('naturmand', 'product', 'pcsk_d1GLe_T74ExWqkNHoTyMoePQkoQGD3TfQkz7DyVYZxRmcjSMDENX2zdd5vun9qAQxNivP', 'naturmand', 'naturmand-pro', 'Hej😊 Kan jeg hjælpe med at besvare et spørgsmål eller anbefale et produkt?⛰️', NOW(), NOW());

-- Configuration 65: naturoghelse
INSERT INTO chatbot_settings (chatbot_id, flow2_key, pinecone_api_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, flow3_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('naturoghelse', 'product', 'pcsk_3UjrPD_31C2RmtD3gCJT257xMaBWDWfxQeCjSC3TFHJiU2hxzDu8uDVkjeSKRKDYDuwVS1', 'naturoghelse-alt', 'naturoghelse-pro', 'humac-pro', 'Hej 😊 Spørg mig om alt – lige fra produkter til generelle spørgsmål, eller få personlige anbefalinger 🤖', NOW(), NOW());

-- Configuration 66: nocla
INSERT INTO chatbot_settings (chatbot_id, flow2_key, pinecone_api_key, knowledgebase_index_endpoint, flow3_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('nocla', 'product', 'pcsk_3UjrPD_31C2RmtD3gCJT257xMaBWDWfxQeCjSC3TFHJiU2hxzDu8uDVkjeSKRKDYDuwVS1', 'nocla-alt', 'humac-pro', 'Hej 😊 Spørg mig om alt – lige fra produkter til generelle spørgsmål, eller få personlige anbefalinger til opskrifter 🤖', NOW(), NOW());

-- Configuration 67: nytelse
INSERT INTO chatbot_settings (chatbot_id, flow3_key, first_message, created_at, updated_at)
VALUES ('nytelse', 'product', 'Hei 😊 Spør meg om alt – alt fra produkter til generelle spørsmål, eller få personlige anbefalinger 🤖', NOW(), NOW());

-- Configuration 68: washworldde
INSERT INTO chatbot_settings (chatbot_id, pinecone_api_key, knowledgebase_index_endpoint, first_message, created_at, updated_at)
VALUES ('washworldde', 'pcsk_t4xAk_H8wDYbReN7o4WUTjziM8q5L9hX1dDkactXPfN7XxrYpRj7VNS4jXRgo32GeyiPM', 'washworld-de', 'Hallo 😊 Wie kann ich Ihnen helfen?🚗', NOW(), NOW());

-- Configuration 69: washworldno
INSERT INTO chatbot_settings (chatbot_id, pinecone_api_key, knowledgebase_index_endpoint, first_message, created_at, updated_at)
VALUES ('washworldno', 'pcsk_t4xAk_H8wDYbReN7o4WUTjziM8q5L9hX1dDkactXPfN7XxrYpRj7VNS4jXRgo32GeyiPM', 'washworld-no', 'Hei 😊 Hva kan jeg hjelpe deg med?🚗', NOW(), NOW());

-- Configuration 70: padelrack
INSERT INTO chatbot_settings (chatbot_id, flow2_key, flow3_key, metadata_key, first_message, created_at, updated_at)
VALUES ('padelrack', 'productnofilter', 'product', 'product', 'Hej😊 Jeg kan besvare spørgsmål og anbefale produkter. Hvad kan jeg hjælpe dig med?', NOW(), NOW());

-- Configuration 71: pecus
INSERT INTO chatbot_settings (chatbot_id, first_message, created_at, updated_at)
VALUES ('pecus', 'Hei😊 Hvordan kan jeg hjelpe deg?', NOW(), NOW());

-- Configuration 72: pizzafredag
INSERT INTO chatbot_settings (chatbot_id, flow3_key, first_message, created_at, updated_at)
VALUES ('pizzafredag', 'product', 'Hej😊 Kan jeg hjælpe med at besvare et spørgsmål eller anbefale et produkt?🍕', NOW(), NOW());

-- Configuration 73: purepower
INSERT INTO chatbot_settings (chatbot_id, flow3_key, apiflow_key, knowledgebase_index_endpoint, flow3_knowledgebase_index, apiflow_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('purepower', 'product', 'order', 'purepower-alt', 'purepower-pro', 'purepower-alt', 'Hej 😎\nSpørg mig om alt – produkter, din ordre, levering, træning eller personlige anbefalinger 🤖', NOW(), NOW());

-- Configuration 74: pursico
INSERT INTO chatbot_settings (chatbot_id, pinecone_api_key, knowledgebase_index_endpoint, created_at, updated_at)
VALUES ('pursico', 'pcsk_5jmBcT_PypcxuLpuC6aGqQtgLXeaM8Nt9GzPtqyBLtpeDATfZgMiDmVinhCJeLGV1zoPSK', 'pursico-alt', NOW(), NOW());

-- Configuration 75: scalepoint
INSERT INTO chatbot_settings (chatbot_id, flow3_key, first_message, created_at, updated_at)
VALUES ('scalepoint', 'product', 'Hej 😊 Spørg mig om alt – lige fra produkter til generelle spørgsmål, eller få personlige anbefalinger 🤖', NOW(), NOW());

-- Configuration 76: sexshop
INSERT INTO chatbot_settings (chatbot_id, flow3_key, pinecone_api_key, knowledgebase_index_endpoint, flow3_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('sexshop', 'product', 'pcsk_5jmBcT_PypcxuLpuC6aGqQtgLXeaM8Nt9GzPtqyBLtpeDATfZgMiDmVinhCJeLGV1zoPSK', 'sexshop-alt', 'sexshop-pro', 'Hej, jeg er din digitale wingman eller -woman 😉 Mangler du hjælp? Så spørg løs om produkter, anbefalinger eller bare nogle solide tips & tricks – Jeg ved, hvad der rykker (og vibrerer) 💪', NOW(), NOW());

-- Configuration 77: skadedyrshopse
INSERT INTO chatbot_settings (chatbot_id, flow2_key, flow3_key, pinecone_api_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, flow3_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('skadedyrshopse', 'category', 'product', 'pcsk_61ikwk_TrrPrpagck8PLsqoc2aeTdhBZoMzRwPXP2Y1pTuw4zw7ewskEyC74Vh7yhcrFEN', 'hhs-se-alt', 'hhs-link-se', 'hhs-se-produkter', 'Hej 😊 Vad kan jag hjälpa dig med? 🐝 (Du kan ställa en fråga eller ladda upp en bild 📷)', NOW(), NOW());

-- Configuration 78: test
INSERT INTO chatbot_settings (chatbot_id, pinecone_api_key, knowledgebase_index_endpoint, flow3_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('test', 'pcsk_6DGzau_SeHjbfsoGMME27Xm9PLKbuQoTMZpA6LHbbYih45v3ybkKeHcxm2fQEzuN3XWMgf', 'humac-alt', 'humac-pro', 'Hej 😊 Spørg mig om alt – lige fra produkter til generelle spørgsmål, eller få personlige anbefalinger 🤖', NOW(), NOW());

-- Configuration 79: skolenfri
INSERT INTO chatbot_settings (chatbot_id, flow3_key, pinecone_api_key, knowledgebase_index_endpoint, first_message, created_at, updated_at)
VALUES ('skolenfri', 'skolenfri', 'pcsk_5jmBcT_PypcxuLpuC6aGqQtgLXeaM8Nt9GzPtqyBLtpeDATfZgMiDmVinhCJeLGV1zoPSK', 'skolenfri-alt', 'Hej 😊 Spørg mig om alt – lige fra undervisning til generelle spørgsmål, eller få personlig vejledning 📚', NOW(), NOW());

-- Configuration 80: skoringen
INSERT INTO chatbot_settings (chatbot_id, flow2_key, flow4_key, metadata_key, pinecone_api_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, flow4_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('skoringen', 'product', 'productfilter', 'productfilter', 'pcsk_2Pv6s6_B2XcjJmDsi7ZCYXqwph4wo18vsGQMTR7ThkWhQ36M5JuMWoKh4kAGG57KHnfXge', 'skoringen-alt', 'skoringen-pro', 'skoringen-pro', 'Hej! 😊 Jeg er din AI assistent og ved en hel del om sko, størrelser, mærker og hvordan du handler hos Skoringen - både online og i butik. Spørg endelig løs, så prøver jeg at hjælpe dig så godt jeg kan...', NOW(), NOW());

-- Configuration 81: skoringen-no
INSERT INTO chatbot_settings (chatbot_id, flow2_key, flow4_key, metadata_key, pinecone_api_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, flow4_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('skoringen-no', 'product', 'productfilter', 'productfilter', 'pcsk_2Pv6s6_B2XcjJmDsi7ZCYXqwph4wo18vsGQMTR7ThkWhQ36M5JuMWoKh4kAGG57KHnfXge', 'skoringen-alt', 'skoringen-pro', 'skoringen-pro', 'Hei! 😊 Jeg er din AI-assistent og vet en hel del om sko, størrelser, merker og hvordan du handler hos Skoringen – både på nett og i butikk. Spør i vei, så skal jeg prøve å hjelpe deg så godt jeg kan...', NOW(), NOW());

-- Configuration 82: skyadventures
INSERT INTO chatbot_settings (chatbot_id, flow3_key, first_message, created_at, updated_at)
VALUES ('skyadventures', 'product', 'Hej, jag är Sky– din AI-assistent 😊 Fråga mig om allt – från kurser till produkter 🪂', NOW(), NOW());

-- Configuration 83: slagteralibaba
INSERT INTO chatbot_settings (chatbot_id, flow3_key, first_message, created_at, updated_at)
VALUES ('slagteralibaba', 'product', 'Hej 😊 Spørg mig om alt – fra udskæringer og tilberedning til opskrifter og gode kødvalg til din ret 🥩🤖', NOW(), NOW());

-- Configuration 84: storeandstefterskole
INSERT INTO chatbot_settings (chatbot_id, knowledgebase_index_endpoint, flow3_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('storeandstefterskole', 'storeandstefterskole-alt', 'humac-pro', 'Hej 😊 Spørg mig om alt – lige fra fag til generelle spørgsmål, eller få personlige anbefalinger 🤖', NOW(), NOW());

-- Configuration 85: superprice
INSERT INTO chatbot_settings (chatbot_id, flow3_key, pinecone_api_key, knowledgebase_index_endpoint, flow3_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('superprice', 'product', 'pcsk_t4xAk_H8wDYbReN7o4WUTjziM8q5L9hX1dDkactXPfN7XxrYpRj7VNS4jXRgo32GeyiPM', 'superprice-alt', 'superprice-pro', 'Er du nysgerrig på vores services så spørg bare her!', NOW(), NOW());

-- Configuration 86: tivolihotel
INSERT INTO chatbot_settings (chatbot_id, flow3_key, first_message, created_at, updated_at)
VALUES ('tivolihotel', 'product', 'Hej😊 Jeg kan besvare dine spørgsmål omkring os og vores hoteller', NOW(), NOW());

-- Configuration 87: trafikskolerne
INSERT INTO chatbot_settings (chatbot_id, pinecone_api_key, knowledgebase_index_endpoint, first_message, created_at, updated_at)
VALUES ('trafikskolerne', 'pcsk_2Pv6s6_B2XcjJmDsi7ZCYXqwph4wo18vsGQMTR7ThkWhQ36M5JuMWoKh4kAGG57KHnfXge', 'trafikskolerne-alt', 'Hej 😊 Spørg mig om alt – lige fra undervisning til generelle spørgsmål 🚖', NOW(), NOW());

-- Configuration 88: trafikteori
INSERT INTO chatbot_settings (chatbot_id, pinecone_api_key, knowledgebase_index_endpoint, first_message, created_at, updated_at)
VALUES ('trafikteori', 'eae35471-7955-4180-bb1e-52f4a1e28f3d', 'trafikteori2', 'Hej😊 Hvad kan jeg hjælpe dig med? Jeg er trænet på teoribogen og undervisningsplanen for kørekort kategori B.', NOW(), NOW());

-- Configuration 89: validahealth
INSERT INTO chatbot_settings (chatbot_id, pinecone_api_key, knowledgebase_index_endpoint, first_message, created_at, updated_at)
VALUES ('validahealth', 'pcsk_t4xAk_H8wDYbReN7o4WUTjziM8q5L9hX1dDkactXPfN7XxrYpRj7VNS4jXRgo32GeyiPM', 'validahealth-alt', 'Hej😊 Hvad kan jeg hjælpe dig med?👩‍⚕️', NOW(), NOW());

-- Configuration 90: veganactive
INSERT INTO chatbot_settings (chatbot_id, flow3_key, first_message, created_at, updated_at)
VALUES ('veganactive', 'product', 'Hej😊 Jeg kan besvare spørgsmål og anbefale produkter. Hvad kan jeg hjælpe dig med?🌱', NOW(), NOW());

-- Configuration 91: vesterlyng
INSERT INTO chatbot_settings (chatbot_id, flow3_key, pinecone_api_key, knowledgebase_index_endpoint, flow3_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('vesterlyng', 'product', 'pcsk_5DhXSe_3TDYCHkg8bdNL2PBgprKCbm1XeewQMnr84fsm18eMH7dgDxxrHKQhxntJduLELJ', 'vesterlyngcamping-alt', 'vesterlyngcamping-alt', 'Hej 😊 Spørg mig om alt – lige fra produkter til generelle spørgsmål, eller få personlige anbefalinger 🤖', NOW(), NOW());

-- Configuration 92: vinhuset_fi
INSERT INTO chatbot_settings (chatbot_id, flow3_key, flow4_key, apiflow_key, metadata_key, pinecone_api_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, flow3_knowledgebase_index, flow4_knowledgebase_index, apiflow_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('vinhuset_fi', 'product', 'productfilter', 'order', 'productfilter', 'pcsk_6DGzau_SeHjbfsoGMME27Xm9PLKbuQoTMZpA6LHbbYih45v3ybkKeHcxm2fQEzuN3XWMgf', 'vinhuset-alt-fi', 'vinhuset-alt', 'vinhuset-pro-fi', 'vinhuset-pro-fi', 'vinhuset-alt-fi', 'Hei 😊 Voit kysyä minulta mitä tahansa – aina tuotteista yleisiin kysymyksiin, tilauksen tilaan tai vinkkeihin ja nikseihin juomien ja tarvikkeiden suhteen 🍾🍷', NOW(), NOW());

-- Configuration 93: vinhuset_se
INSERT INTO chatbot_settings (chatbot_id, flow3_key, flow4_key, apiflow_key, metadata_key, pinecone_api_key, knowledgebase_index_endpoint, flow2_knowledgebase_index, flow3_knowledgebase_index, flow4_knowledgebase_index, apiflow_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('vinhuset_se', 'product', 'productfilter', 'order', 'productfilter', 'pcsk_6DGzau_SeHjbfsoGMME27Xm9PLKbuQoTMZpA6LHbbYih45v3ybkKeHcxm2fQEzuN3XWMgf', 'vinhuset-alt-se', 'vinhuset-alt', 'vinhuset-pro-se', 'vinhuset-pro-se', 'vinhuset-alt-se', 'Hej 😊 Fråga mig om vad som helst – allt från våra viner och orderstatus till allmänna frågor eller tips & tricks för en ännu bättre vinupplevelse🍾🍷', NOW(), NOW());

-- Configuration 94: virtooai
INSERT INTO chatbot_settings (chatbot_id, flow3_key, pinecone_api_key, knowledgebase_index_endpoint, first_message, created_at, updated_at)
VALUES ('virtooai', 'product', 'pcsk_GNBAU_9Y2fpBkz3mhEpx6EYLZjov7rJd4DuMNg76vpm8fZqsvPK6rkFCdEPTwRh5YuRUh', 'virtooai', 'Book en uforpligtende snak eller chat direkte med vores AI-bot nu', NOW(), NOW());

-- Configuration 95: washworld
INSERT INTO chatbot_settings (chatbot_id, pinecone_api_key, knowledgebase_index_endpoint, first_message, created_at, updated_at)
VALUES ('washworld', 'pcsk_t4xAk_H8wDYbReN7o4WUTjziM8q5L9hX1dDkactXPfN7XxrYpRj7VNS4jXRgo32GeyiPM', 'washworld1', 'Hej😊 Hvad kan jeg hjælpe dig med?🚗', NOW(), NOW());

-- Configuration 96: washworldse
INSERT INTO chatbot_settings (chatbot_id, pinecone_api_key, knowledgebase_index_endpoint, first_message, created_at, updated_at)
VALUES ('washworldse', 'pcsk_t4xAk_H8wDYbReN7o4WUTjziM8q5L9hX1dDkactXPfN7XxrYpRj7VNS4jXRgo32GeyiPM', 'washworld-se', 'Hej 😊 Vad kan jag hjälpa dig med?🚗', NOW(), NOW());

-- Configuration 97: yaay
INSERT INTO chatbot_settings (chatbot_id, flow3_key, pinecone_api_key, knowledgebase_index_endpoint, flow3_knowledgebase_index, first_message, created_at, updated_at)
VALUES ('yaay', 'product', 'pcsk_5DhXSe_3TDYCHkg8bdNL2PBgprKCbm1XeewQMnr84fsm18eMH7dgDxxrHKQhxntJduLELJ', 'yaay-alt', 'yaay-pro', 'Hej 😊 Spørg mig om alt – lige fra produkter til generelle spørgsmål, eller få personlige anbefalinger 🤖', NOW(), NOW());

-- Step 4: Verify the inserted data
SELECT 
  chatbot_id,
  flow2_key,
  flow3_key,
  flow4_key,
  apiflow_key,
  metadata_key,
  metadata2_key,
  pinecone_api_key IS NOT NULL as has_pinecone_key,
  knowledgebase_index_endpoint,
  flow2_knowledgebase_index,
  flow3_knowledgebase_index,
  flow4_knowledgebase_index,
  apiflow_knowledgebase_index,
  first_message IS NOT NULL as has_first_message,
  image_enabled,
  camera_button_enabled,
  created_at,
  updated_at
FROM chatbot_settings 
ORDER BY chatbot_id;