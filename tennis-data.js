/*
 * Tennis player database: ATP Bastad, Gstaad, Umag + WTA Iasi, Athens (2026).
 * dob is YYYY-MM-DD.
 *
 * STATUS (in progress): full-field research for all 5 tournaments is still
 * underway. Only players with a confidently verified date of birth are
 * listed here - nothing below is guessed. Umag and Iasi have no verified
 * entries yet. This file will be expanded as more players are confirmed.
 */

const TENNIS_PLAYERS = [
  // --- ATP Bastad (Nordea Open) ---
{ name: 'Botic van de Zandschulp', dob: '1995-10-04', tour: 'ATP', tournament: 'Bastad' },
  { name: 'Adolfo Daniel Vallejo', dob: '2004-04-28', tour: 'ATP', tournament: 'Bastad' },
  { name: 'Nuno Borges', dob: '1997-02-19', tour: 'ATP', tournament: 'Bastad' },
  { name: 'Grigor Dimitrov', dob: '1991-05-16', tour: 'ATP', tournament: 'Bastad' },
  { name: 'Stefano Travaglia', dob: '1991-12-28', tour: 'ATP', tournament: 'Bastad' },
  { name: 'Mariano Navone', dob: '2001-02-27', tour: 'ATP', tournament: 'Bastad' },
  { name: 'Daniel Altmaier', dob: '1998-09-12', tour: 'ATP', tournament: 'Bastad' },
  { name: 'Luciano Darderi', dob: '2002-02-14', tour: 'ATP', tournament: 'Bastad' },
  { name: 'Andrey Rublev', dob: '1997-10-20', tour: 'ATP', tournament: 'Bastad' },
  { name: 'Andrea Pellegrino', dob: '1997-03-23', tour: 'ATP', tournament: 'Bastad' },
  { name: 'Alejandro Tabilo', dob: '1997-06-02', tour: 'ATP', tournament: 'Bastad' },
  { name: 'Lautaro Midon', dob: '2004-03-29', tour: 'ATP', tournament: 'Bastad' },
  { name: 'Nikoloz Basilashvili', dob: '1992-02-23', tour: 'ATP', tournament: 'Bastad' },
  { name: 'Thiago Agustin Tirante', dob: '2001-04-10', tour: 'ATP', tournament: 'Bastad' },
  { name: 'Jesper de Jong', dob: '2000-05-31', tour: 'ATP', tournament: 'Bastad' },
  { name: 'Sebastian Baez', dob: '2000-12-28', tour: 'ATP', tournament: 'Bastad' },

  // --- ATP Gstaad (EFG Swiss Open) ---
 { name: 'Raphael Collignon', dob: '2002-01-16', tour: 'ATP', tournament: 'Gstaad' },
  { name: 'Lorenzo Sonego', dob: '1995-05-11', tour: 'ATP', tournament: 'Gstaad' },
  { name: 'Arthur Rinderknech', dob: '1995-07-23', tour: 'ATP', tournament: 'Gstaad' },
  { name: 'Clement Tabur', dob: '2000-01-24', tour: 'ATP', tournament: 'Gstaad' },
  { name: 'Yannick Hanfmann', dob: '1991-11-13', tour: 'ATP', tournament: 'Gstaad' },
  { name: 'Valentin Vacherot', dob: '1998-12-16', tour: 'ATP', tournament: 'Gstaad' },
  { name: 'Jerome Kym', dob: '2003-02-12', tour: 'ATP', tournament: 'Gstaad' },
  { name: 'Stefanos Tsitsipas', dob: '1998-08-12', tour: 'ATP', tournament: 'Gstaad' },
  { name: 'Alexander Bublik', dob: '1997-06-17', tour: 'ATP', tournament: 'Gstaad' },
  { name: 'Quentin Halys', dob: '1996-10-26', tour: 'ATP', tournament: 'Gstaad' },
  { name: 'Jaime Faria', dob: '2003-08-06', tour: 'ATP', tournament: 'Gstaad' },
  { name: 'Casper Ruud', dob: '1998-12-22', tour: 'ATP', tournament: 'Gstaad' },
  { name: 'Juan Manuel Cerundolo', dob: '2001-11-15', tour: 'ATP', tournament: 'Gstaad' },
  { name: 'Miomir Kecmanovic', dob: '1999-08-31', tour: 'ATP', tournament: 'Gstaad' },
  { name: 'Alexander Shevchenko', dob: '2000-11-29', tour: 'ATP', tournament: 'Gstaad' },
  { name: 'Dominic Stricker', dob: '2002-08-16', tour: 'ATP', tournament: 'Gstaad' },

  // --- WTA Athens ---
  { name: 'Elena Micic', dob: '2004-07-13', tour: 'WTA', tournament: 'Athens' },
  { name: 'Zheng Qinwen', dob: '2002-10-08', tour: 'WTA', tournament: 'Athens' },
  { name: 'Harriet Dart', dob: '1996-07-28', tour: 'WTA', tournament: 'Athens' },
  { name: 'Maria Sakkari', dob: '1995-07-25', tour: 'WTA', tournament: 'Athens' },
  { name: 'Mai Hontama', dob: '1999-05-30', tour: 'WTA', tournament: 'Athens' },
  { name: 'Alycia Parks', dob: '2000-12-31', tour: 'WTA', tournament: 'Athens' },
  { name: 'Lilli Tagger', dob: '2008-02-17', tour: 'WTA', tournament: 'Athens' },
  { name: 'Sara Bejlek', dob: '2006-01-31', tour: 'WTA', tournament: 'Athens' },
  { name: 'Clara Tauson', dob: '2002-12-21', tour: 'WTA', tournament: 'Athens' },
  { name: 'Miriana Tona', dob: '1995-03-24', tour: 'WTA', tournament: 'Athens' },
  { name: 'Barbora Krejcikova', dob: '1995-12-18', tour: 'WTA', tournament: 'Athens' },
  { name: 'Carole Monnet', dob: '2001-12-01', tour: 'WTA', tournament: 'Athens' },
  { name: 'Alina Korneeva', dob: '2007-06-23', tour: 'WTA', tournament: 'Athens' },
  { name: 'Ann Li', dob: '2000-06-26', tour: 'WTA', tournament: 'Athens' },
  { name: 'Tereza Valentova', dob: '2007-02-05', tour: 'WTA', tournament: 'Athens' },
  { name: 'Aliaksandra Sasnovich', dob: '1994-03-22', tour: 'WTA', tournament: 'Athens' },

  // --- ATP Umag: none verified yet ---
{ name: 'Federico Agustin Gomez', dob: '1996-11-26', tour: 'ATP', tournament: 'Umag' },
{ name: 'Matteo Arnaldi', dob: '2001-02-22', tour: 'ATP', tournament: 'Umag' },
{ name: 'Tomas Martin Etcheverry', dob: '1999-07-18', tour: 'ATP', tournament: 'Umag' },
{ name: 'Daniel Merida Aguilar', dob: '2004-09-26', tour: 'ATP', tournament: 'Umag' },
{ name: 'Juan Carlos Prado Angelo', dob: '2005-03-06', tour: 'ATP', tournament: 'Umag' },
{ name: 'Damir Dzumhur', dob: '1992-05-20', tour: 'ATP', tournament: 'Umag' },
{ name: 'Pablo Carreno Busta', dob: '1991-07-12', tour: 'ATP', tournament: 'Umag' },
{ name: 'Camilo Ugo Carabelli', dob: '1999-06-17', tour: 'ATP', tournament: 'Umag' },
{ name: 'Marco Trungelliti', dob: '1990-01-31', tour: 'ATP', tournament: 'Umag' },
{ name: 'Alejandro Davidovich Fokina', dob: '1999-06-05', tour: 'ATP', tournament: 'Umag' },
{ name: 'Flavio Cobolli', dob: '2002-05-06', tour: 'ATP', tournament: 'Umag' },
{ name: 'Roman Andres Burruchaga', dob: '2002-01-23', tour: 'ATP', tournament: 'Umag' },
{ name: 'Luca Van Assche', dob: '2004-05-11', tour: 'ATP', tournament: 'Umag' },
{ name: 'Titouan Droguet', dob: '2001-06-15', tour: 'ATP', tournament: 'Umag' },
{ name: 'Dino Prizmic', dob: '2005-08-05', tour: 'ATP', tournament: 'Umag' },
{ name: 'Alex Molcan', dob: '1997-12-01', tour: 'ATP', tournament: 'Umag' },

  // --- WTA Iasi: none verified yet ---
 { name: 'Mayar Sherif', dob: '1996-05-05', tour: 'WTA', tournament: 'Iasi' },
  { name: 'Kaitlin Quevedo', dob: '2006-02-13', tour: 'WTA', tournament: 'Iasi' },
  { name: 'Yulia Putintseva', dob: '1995-01-07', tour: 'WTA', tournament: 'Iasi' },
  { name: 'Alina Charaeva', dob: '2002-05-27', tour: 'WTA', tournament: 'Iasi' },
  { name: 'Anna Bondar', dob: '1997-05-27', tour: 'WTA', tournament: 'Iasi' },
  { name: 'Tamara Zidansek', dob: '1997-12-26', tour: 'WTA', tournament: 'Iasi' },
  { name: 'Clara Burel', dob: '2001-03-24', tour: 'WTA', tournament: 'Iasi' },
  { name: 'Elsa Jacquemot', dob: '2003-05-03', tour: 'WTA', tournament: 'Iasi' },
  { name: 'Elina Avanesyan', dob: '2002-09-17', tour: 'WTA', tournament: 'Iasi' },
  { name: 'Petra Marcinko', dob: '2005-12-04', tour: 'WTA', tournament: 'Iasi' },
  { name: 'Alevtina Ibragimova', dob: '2005-01-19', tour: 'WTA', tournament: 'Iasi' },
  { name: 'Paula Badosa', dob: '1997-11-15', tour: 'WTA', tournament: 'Iasi' },
  { name: 'Oleksandra Oliynykova', dob: '2001-01-03', tour: 'WTA', tournament: 'Iasi' },
  { name: 'Elena Pridankina', dob: '2005-08-30', tour: 'WTA', tournament: 'Iasi' },
  { name: 'Panna Udvardy', dob: '1998-09-28', tour: 'WTA', tournament: 'Iasi' },
  { name: 'Katarzyna Kawa', dob: '1992-11-17', tour: 'WTA', tournament: 'Iasi' },

];
