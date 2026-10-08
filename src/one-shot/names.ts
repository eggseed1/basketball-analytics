import type { Rng } from "./rng";
import { country } from "./world";

/**
 * Cosmetic name pools. A pool is picked from the place of birth; the player
 * can rename at birth. Names never affect the simulation.
 */
interface Pool {
  given: string[];
  family: string[];
  /** Family name first in display (East Asian order). */
  familyFirst?: boolean;
}

const POOLS: Record<string, Pool> = {
  us: {
    given: ["Jalen", "Marcus", "Tyler", "Caleb", "Isaiah", "Jordan", "Malik", "Ethan", "Devin", "Andre", "Luis", "Mason", "Trey", "Cameron", "Elijah", "Darius", "Nate", "Xavier"],
    family: ["Johnson", "Williams", "Brown", "Davis", "Carter", "Robinson", "Mitchell", "Hayes", "Coleman", "Brooks", "Ramirez", "Turner", "Walker", "Henderson", "Price", "Foster", "Sullivan", "Greene"],
  },
  anglo: {
    given: ["Oliver", "Jack", "Harry", "Liam", "Callum", "Noah", "Kieran", "Thomas", "Ryan", "Josh", "Finn", "Sam", "Lewis", "Owen"],
    family: ["Smith", "Taylor", "Walsh", "Murphy", "Evans", "Clarke", "Hughes", "Kelly", "Wright", "Byrne", "Morgan", "Bennett", "Reid", "Campbell"],
  },
  aunz: {
    given: ["Jack", "Lachlan", "Cooper", "Tom", "Riley", "Mitchell", "Josh", "Hamish", "Kai", "Ben", "Will", "Tane", "Nate", "Liam"],
    family: ["Smith", "Wilson", "Thompson", "Walker", "Kennedy", "Ngata", "Harris", "Ryan", "Campbell", "Te Rangi", "Martin", "Kelly", "Roberts", "White"],
  },
  ca: {
    given: ["Liam", "Noah", "Olivier", "Ethan", "Félix", "Andrew", "Jamal", "Lucas", "Samuel", "Nathan", "Gabriel", "Owen", "Zach", "Dillon"],
    family: ["Tremblay", "Smith", "Gagnon", "Brown", "Roy", "MacDonald", "Wilson", "Côté", "Campbell", "Bouchard", "Murray", "Clarke", "Singh", "Gauthier"],
  },
  es: {
    given: ["Pablo", "Sergio", "Álvaro", "Hugo", "Javier", "Marc", "Jaime", "Diego", "Iván", "Rubén", "Adrián", "Mario", "Pau", "Unai"],
    family: ["García", "Fernández", "López", "Martínez", "Sánchez", "Pérez", "Navarro", "Ruiz", "Iglesias", "Ortega", "Castro", "Romero", "Vidal", "Serrano"],
  },
  latam: {
    given: ["Mateo", "Santiago", "Sebastián", "Thiago", "Emiliano", "Joaquín", "Facundo", "Nicolás", "Andrés", "Diego", "Tomás", "Gael", "Bruno", "Luciano"],
    family: ["González", "Rodríguez", "Hernández", "Díaz", "Torres", "Ramírez", "Flores", "Vargas", "Morales", "Castillo", "Medina", "Rojas", "Herrera", "Aguilar"],
  },
  caribbean_es: {
    given: ["José", "Luis", "Ángel", "Carlos", "Jean", "Yeison", "Wilmer", "Kelvin", "Jonathan", "Eddie", "Ramón", "Alexis", "Héctor", "Javier"],
    family: ["Rivera", "Santana", "Pérez", "Rosario", "Cruz", "Peña", "Batista", "Reyes", "Martínez", "De la Cruz", "Ortiz", "Vázquez", "Mercedes", "Feliz"],
  },
  br: {
    given: ["Gabriel", "Lucas", "Matheus", "Guilherme", "Rafael", "Thiago", "Bruno", "Felipe", "Vinícius", "Caio", "Leandro", "Diego", "João", "Pedro"],
    family: ["Silva", "Santos", "Oliveira", "Souza", "Lima", "Pereira", "Costa", "Ferreira", "Almeida", "Ribeiro", "Carvalho", "Gomes", "Barbosa", "Rocha"],
  },
  pt: {
    given: ["João", "Tiago", "Rodrigo", "Diogo", "Miguel", "Rafael", "Gonçalo", "Duarte", "Tomás", "Afonso", "Pedro", "Rui", "Nuno", "André"],
    family: ["Silva", "Santos", "Ferreira", "Pereira", "Oliveira", "Costa", "Rodrigues", "Martins", "Sousa", "Fernandes", "Gonçalves", "Lopes", "Marques", "Alves"],
  },
  fr: {
    given: ["Lucas", "Hugo", "Théo", "Nathan", "Mathis", "Enzo", "Maxime", "Bilal", "Yanis", "Killian", "Axel", "Moussa", "Louis", "Rudy"],
    family: ["Martin", "Bernard", "Dubois", "Moreau", "Laurent", "Lefebvre", "Girard", "Diallo", "Fournier", "Mercier", "Bonnet", "Lambert", "Fontaine", "Rousseau"],
  },
  it: {
    given: ["Lorenzo", "Matteo", "Alessandro", "Leonardo", "Andrea", "Simone", "Gabriele", "Riccardo", "Davide", "Niccolò", "Tommaso", "Pietro", "Marco", "Luca"],
    family: ["Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano", "Colombo", "Ricci", "Marino", "Greco", "Bruno", "Gallo", "Conti", "Fontana"],
  },
  de: {
    given: ["Lukas", "Leon", "Finn", "Jonas", "Paul", "Moritz", "Felix", "Niklas", "Tim", "Maximilian", "Elias", "Jannik", "Dennis", "Johannes"],
    family: ["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Wagner", "Becker", "Hoffmann", "Schulz", "Koch", "Richter", "Wolf", "Hartmann", "Krüger"],
  },
  nl: {
    given: ["Daan", "Sem", "Luuk", "Milan", "Jesse", "Thijs", "Bram", "Lars", "Ruben", "Stijn", "Wout", "Jens", "Arne", "Joris"],
    family: ["de Jong", "Jansen", "de Vries", "van Dijk", "Bakker", "Visser", "Peeters", "Smit", "Maes", "Janssens", "Mulder", "Willems", "Claes", "Hendriks"],
  },
  nordic: {
    given: ["Oskar", "Elias", "William", "Lucas", "Emil", "Magnus", "Viktor", "Anton", "Mathias", "Jonas", "Axel", "Gustav", "Sindre", "Jón"],
    family: ["Andersson", "Johansson", "Hansen", "Nielsen", "Larsen", "Karlsson", "Olsen", "Pedersen", "Lindqvist", "Berg", "Halvorsen", "Jensen", "Stefánsson", "Dahl"],
  },
  fi: {
    given: ["Eetu", "Onni", "Aleksi", "Lauri", "Miro", "Elias", "Joonas", "Veeti", "Sami", "Antti", "Topi", "Jere", "Niko", "Ville"],
    family: ["Korhonen", "Virtanen", "Mäkinen", "Nieminen", "Mäkelä", "Hämäläinen", "Laine", "Heikkinen", "Koskinen", "Järvinen", "Lehtonen", "Salo", "Lindroos", "Kallio"],
  },
  lt: {
    given: ["Lukas", "Matas", "Jonas", "Dovydas", "Rokas", "Mantas", "Tomas", "Arnas", "Deividas", "Ignas", "Paulius", "Karolis", "Žygimantas", "Nojus"],
    family: ["Kazlauskas", "Jankauskas", "Petrauskas", "Stankevičius", "Vasiliauskas", "Žukauskas", "Butkus", "Paulauskas", "Urbonas", "Kavaliauskas", "Navickas", "Rimkus", "Grigonis", "Lukoševičius"],
  },
  lv_ee: {
    given: ["Kristaps", "Rolands", "Artūrs", "Mārtiņš", "Kārlis", "Jānis", "Rasmus", "Karl", "Markus", "Kaspar", "Sander", "Henri", "Rauno", "Dāvis"],
    family: ["Bērziņš", "Kalniņš", "Ozoliņš", "Liepiņš", "Krūmiņš", "Tamm", "Saar", "Sepp", "Mägi", "Kask", "Rebane", "Lācis", "Vītols", "Kukk"],
  },
  pl: {
    given: ["Jakub", "Kacper", "Szymon", "Filip", "Mateusz", "Michał", "Bartosz", "Wojciech", "Piotr", "Adam", "Tomasz", "Kamil", "Igor", "Dawid"],
    family: ["Nowak", "Kowalski", "Wiśniewski", "Wójcik", "Kamiński", "Lewandowski", "Zieliński", "Szymański", "Woźniak", "Dąbrowski", "Kozłowski", "Mazur", "Krawczyk", "Jabłoński"],
  },
  cz_sk: {
    given: ["Jakub", "Jan", "Tomáš", "Matěj", "Vojtěch", "Adam", "Ondřej", "Lukáš", "Martin", "Marek", "Patrik", "Filip", "Dominik", "Šimon"],
    family: ["Novák", "Svoboda", "Novotný", "Dvořák", "Černý", "Procházka", "Kučera", "Veselý", "Horváth", "Kováč", "Varga", "Tóth", "Pokorný", "Marek"],
  },
  hu: {
    given: ["Bence", "Máté", "Levente", "Dominik", "Ádám", "Dániel", "Balázs", "Márk", "Zsolt", "Gergő", "Tamás", "Kristóf", "Zalán", "Áron"],
    family: ["Nagy", "Kovács", "Tóth", "Szabó", "Horváth", "Varga", "Kiss", "Molnár", "Németh", "Farkas", "Balogh", "Papp", "Takács", "Juhász"],
  },
  ro: {
    given: ["Andrei", "Alexandru", "Mihai", "Ștefan", "David", "Gabriel", "Matei", "Ionuț", "Vlad", "Cristian", "Radu", "Darius", "Victor", "Sergiu"],
    family: ["Popescu", "Ionescu", "Popa", "Dumitru", "Stan", "Stoica", "Gheorghe", "Matei", "Ciobanu", "Rusu", "Munteanu", "Constantin", "Lungu", "Moldovan"],
  },
  balkan: {
    given: ["Nikola", "Lovro", "Marko", "Stefan", "Filip", "Bogdan", "Vasilije", "Dario", "Ivan", "Aleksa", "Mario", "Emir", "Tarik", "Jure"],
    family: ["Jovanović", "Petrović", "Nikolić", "Marković", "Horvat", "Kovačević", "Babić", "Hodžić", "Novak", "Popović", "Đorđević", "Begić", "Krajnc", "Vujović"],
  },
  bg_mk: {
    given: ["Georgi", "Dimitar", "Ivan", "Nikolay", "Aleksandar", "Martin", "Kaloyan", "Viktor", "Stefan", "Bojan", "Petar", "Todor", "Hristo", "Daniel"],
    family: ["Ivanov", "Georgiev", "Dimitrov", "Petrov", "Nikolov", "Stoyanov", "Todorov", "Angelov", "Stojanovski", "Trajkovski", "Popov", "Kolev", "Iliev", "Hristov"],
  },
  gr: {
    given: ["Giorgos", "Dimitris", "Nikos", "Konstantinos", "Spyros", "Kostas", "Panagiotis", "Vasilis", "Petros", "Christos", "Alexandros", "Michalis", "Stavros", "Andreas"],
    family: ["Papadopoulos", "Georgiou", "Nikolaou", "Papadakis", "Konstantinou", "Ioannou", "Vlachos", "Dimitriou", "Antoniou", "Christodoulou", "Pappas", "Karagiannis", "Kalogeropoulos", "Mavros"],
  },
  tr_az: {
    given: ["Mehmet", "Emre", "Can", "Burak", "Arda", "Yusuf", "Kerem", "Alperen", "Ömer", "Furkan", "Elvin", "Rauf", "Ege", "Baran"],
    family: ["Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Yıldız", "Aydın", "Öztürk", "Arslan", "Doğan", "Aliyev", "Mammadov", "Korkmaz", "Polat"],
  },
  al_xk: {
    given: ["Arben", "Dren", "Erion", "Besnik", "Klajdi", "Ardit", "Endrit", "Ilir", "Gentian", "Altin", "Florian", "Rron", "Leart", "Blerim"],
    family: ["Hoxha", "Krasniqi", "Gashi", "Berisha", "Shala", "Morina", "Leka", "Dervishi", "Kelmendi", "Bytyqi", "Hasani", "Rexhepi", "Cela", "Muça"],
  },
  east_slavic: {
    given: ["Artem", "Maksim", "Dmitry", "Nikita", "Ivan", "Kirill", "Bogdan", "Andriy", "Pavel", "Yegor", "Oleksandr", "Mikhail", "Denys", "Vlad"],
    family: ["Ivanov", "Smirnov", "Kuznetsov", "Popov", "Shevchenko", "Kovalenko", "Bondarenko", "Novikov", "Morozov", "Volkov", "Tkachenko", "Melnyk", "Sokolov", "Lebedev"],
  },
  caucasus: {
    given: ["Giorgi", "Luka", "Davit", "Nika", "Levan", "Tornike", "Aram", "Tigran", "Hayk", "Gor", "Sandro", "Irakli", "Narek", "Armen"],
    family: ["Beridze", "Kapanadze", "Gelashvili", "Maisuradze", "Tsiklauri", "Lomidze", "Hakobyan", "Petrosyan", "Grigoryan", "Sargsyan", "Harutyunyan", "Japaridze", "Chkheidze", "Avetisyan"],
  },
  central_asia: {
    given: ["Nursultan", "Aibek", "Timur", "Rustam", "Dauren", "Bekzod", "Azamat", "Farrukh", "Sanjar", "Arman", "Erlan", "Jasur", "Murat", "Islam"],
    family: ["Nurlanov", "Abdullayev", "Karimov", "Saidov", "Tokayev", "Rakhimov", "Ismoilov", "Beisenov", "Yusupov", "Sultanov", "Akhmetov", "Rashidov", "Omarov", "Zhumabayev"],
  },
  mn: {
    given: ["Bat-Erdene", "Temuulen", "Enkhbayar", "Ganbold", "Tuguldur", "Munkh-Orgil", "Bilguun", "Erdenebat", "Sukhbaatar", "Anar", "Nomin-Erdene", "Batbayar", "Khulan", "Otgonbayar"],
    family: ["Batbold", "Ganbaatar", "Enkhtuvshin", "Altangerel", "Purevdorj", "Tserendorj", "Bayarsaikhan", "Lkhagva", "Dorj", "Sukh", "Naranbaatar", "Oyunbileg", "Damdin", "Gombo"],
  },
  cn: {
    familyFirst: true,
    given: ["Wei", "Hao", "Jun", "Zhiwei", "Yuxuan", "Haoran", "Zihan", "Mingze", "Junjie", "Tianyu", "Jiahao", "Yichen", "Kai", "Rui"],
    family: ["Wang", "Li", "Zhang", "Liu", "Chen", "Yang", "Zhao", "Huang", "Zhou", "Wu", "Xu", "Sun", "Hu", "Guo"],
  },
  tw: {
    familyFirst: true,
    given: ["Chia-hao", "Po-yu", "Yu-ting", "Cheng-en", "Wei-lun", "Tzu-chieh", "Chun-hsien", "Yen-ting", "Kuan-lin", "Hsiang-yu", "Shih-chieh", "Chih-wei"],
    family: ["Chen", "Lin", "Huang", "Chang", "Lee", "Wang", "Wu", "Liu", "Tsai", "Yang", "Hsu", "Cheng"],
  },
  hk: {
    familyFirst: true,
    given: ["Ka-ho", "Chun-kit", "Wing-hong", "Tsz-hin", "Ho-yin", "Kin-wai", "Man-lok", "Chi-fung", "Pak-hei", "Ka-lok", "Sio-man", "Hou-in"],
    family: ["Chan", "Wong", "Leung", "Cheung", "Lau", "Lee", "Ho", "Ng", "Lam", "Tang", "Chow", "Leong"],
  },
  jp: {
    familyFirst: true,
    given: ["Haruto", "Sota", "Yuto", "Riku", "Ren", "Kaito", "Yuki", "Takumi", "Daiki", "Shota", "Rui", "Kenta", "Hayato", "Yudai"],
    family: ["Sato", "Suzuki", "Takahashi", "Tanaka", "Watanabe", "Ito", "Yamamoto", "Nakamura", "Kobayashi", "Kato", "Yoshida", "Yamada", "Inoue", "Kimura"],
  },
  kr: {
    familyFirst: true,
    given: ["Min-jun", "Seo-jun", "Ha-jun", "Do-yun", "Ji-ho", "Jun-seo", "Hyun-woo", "Ji-hoon", "Seung-hyun", "Dong-hyun", "Jae-won", "Tae-yang", "Woo-jin", "Sung-min"],
    family: ["Kim", "Lee", "Park", "Choi", "Jung", "Kang", "Cho", "Yoon", "Jang", "Lim", "Han", "Oh", "Seo", "Shin"],
  },
  ph: {
    given: ["Juan", "Miguel", "Joshua", "Carlo", "Paolo", "Kyle", "Jericho", "Kenneth", "Ange", "Rhenz", "Marc", "Rafael", "Justin", "Daniel"],
    family: ["Santos", "Reyes", "Cruz", "Bautista", "Garcia", "Mendoza", "Dela Cruz", "Villanueva", "Aquino", "Ramos", "Navarro", "Castro", "Pascual", "Tolentino"],
  },
  malay: {
    given: ["Muhammad", "Ahmad", "Rizky", "Aditya", "Fajar", "Arif", "Danial", "Irfan", "Hafiz", "Bayu", "Dimas", "Putra", "Hakim", "Syafiq"],
    family: ["Pratama", "Saputra", "Hidayat", "Wijaya", "Kurniawan", "Abdullah", "Rahman", "Ismail", "Santoso", "Setiawan", "Nugroho", "Ibrahim", "Hassan", "Halim"],
  },
  vn: {
    familyFirst: true,
    given: ["Minh", "Huy", "Khoa", "Long", "Nam", "Phúc", "Quân", "Bảo", "Đức", "Tuấn", "Hoàng", "Khang", "Thành", "Trí"],
    family: ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô"],
  },
  th: {
    given: ["Thanawat", "Kittipong", "Nattapong", "Phongsakorn", "Chanathip", "Sorawit", "Teerapat", "Anucha", "Wichai", "Somchai", "Krit", "Pakorn", "Tanat", "Nawat"],
    family: ["Saetang", "Srisuk", "Wongsawat", "Chaiyaporn", "Rattanakorn", "Boonmee", "Thongchai", "Kaewkla", "Sukprasert", "Phromma", "Chanthavong", "Somboon", "Inthavong", "Keomany"],
  },
  mainland_sea: {
    given: ["Sokha", "Dara", "Vannak", "Bunthoeun", "Aung", "Kyaw", "Zaw", "Thura", "Phet", "Somphone", "Ratanak", "Min", "Htet", "Sovann"],
    family: ["Sok", "Chea", "Kim", "Heng", "Phan", "Win", "Oo", "Naing", "Htun", "Soe", "Vongsa", "Keo", "Chanthala", "Mao"],
  },
  south_asia: {
    given: ["Arjun", "Rohan", "Aarav", "Vihaan", "Karan", "Siddharth", "Aditya", "Rahul", "Amit", "Pranav", "Ishaan", "Harsh", "Satnam", "Vikram"],
    family: ["Sharma", "Singh", "Patel", "Kumar", "Reddy", "Nair", "Gupta", "Verma", "Iyer", "Das", "Bhullar", "Menon", "Joshi", "Rao"],
  },
  pk_af: {
    given: ["Ahmed", "Ali", "Hamza", "Usman", "Bilal", "Zain", "Faisal", "Imran", "Omar", "Saad", "Wahid", "Farhad", "Naveed", "Karim"],
    family: ["Khan", "Ahmed", "Malik", "Hussain", "Qureshi", "Butt", "Shah", "Chaudhry", "Raza", "Ahmadzai", "Sultani", "Mirza", "Siddiqui", "Hakimi"],
  },
  bd_np_lk: {
    given: ["Rahim", "Tanvir", "Sabbir", "Arif", "Nabil", "Sujan", "Bibek", "Pasang", "Kasun", "Nuwan", "Tharindu", "Ramesh", "Anil", "Prakash"],
    family: ["Hossain", "Rahman", "Islam", "Chowdhury", "Sarkar", "Shrestha", "Gurung", "Tamang", "Thapa", "Perera", "Fernando", "Silva", "Bandara", "Rai"],
  },
  arab: {
    given: ["Mohammed", "Ahmed", "Omar", "Youssef", "Khaled", "Hassan", "Ali", "Karim", "Ibrahim", "Tarek", "Hamza", "Saif", "Adel", "Fares"],
    family: ["Al-Harbi", "Haddad", "Mansour", "Khalil", "Nasser", "Saleh", "Hamdan", "El-Sayed", "Benali", "Abdallah", "Darwish", "Barakat", "Aziz", "Fakhoury"],
  },
  maghreb: {
    given: ["Mehdi", "Yassine", "Amine", "Anis", "Walid", "Sofiane", "Hamza", "Ayoub", "Nabil", "Rayan", "Karim", "Ilyes", "Zakaria", "Omar"],
    family: ["Benali", "Bouzid", "El Idrissi", "Haddad", "Mansouri", "Trabelsi", "Ben Salah", "Amrani", "Cherif", "Bennani", "Saidi", "Belkacem", "Gharbi", "Mejri"],
  },
  ir: {
    given: ["Amir", "Reza", "Ali", "Mohammad", "Hossein", "Arash", "Behnam", "Kian", "Sina", "Pouya", "Navid", "Hamed", "Saman", "Arsalan"],
    family: ["Hosseini", "Ahmadi", "Rezaei", "Mohammadi", "Karimi", "Hashemi", "Moradi", "Jafari", "Rahimi", "Sadeghi", "Kazemi", "Haddadi", "Nikkhah", "Ghasemi"],
  },
  il: {
    given: ["Noam", "Itay", "Yonatan", "Omer", "Ariel", "Eitan", "Daniel", "Yoav", "Amit", "Roi", "Guy", "Deni", "Tomer", "Lior"],
    family: ["Cohen", "Levi", "Mizrahi", "Peretz", "Biton", "Friedman", "Avraham", "Katz", "Shapiro", "Dahan", "Golan", "Azoulay", "Ben-David", "Halperin"],
  },
  ng: {
    given: ["Chinedu", "Oluwaseun", "Emeka", "Tunde", "Ifeanyi", "Abubakar", "Chukwuemeka", "Femi", "Ikenna", "Musa", "Obinna", "Kelechi", "Adebayo", "Uche"],
    family: ["Okafor", "Adeyemi", "Okonkwo", "Balogun", "Eze", "Bello", "Nwosu", "Ogunleye", "Ibrahim", "Adebayo", "Obi", "Okeke", "Aminu", "Nnaji"],
  },
  west_africa_en: {
    given: ["Kwame", "Kofi", "Yaw", "Kojo", "Ebenezer", "Prince", "Samuel", "Momodou", "Lamin", "Abdoulie", "Foday", "Emmanuel", "Joseph", "Nana"],
    family: ["Mensah", "Owusu", "Boateng", "Asante", "Appiah", "Darko", "Jallow", "Ceesay", "Touray", "Kamara", "Sesay", "Koroma", "Kollie", "Johnson"],
  },
  sahel_fr: {
    given: ["Mamadou", "Moussa", "Ousmane", "Cheikh", "Abdoulaye", "Ibrahima", "Souleymane", "Seydou", "Boubacar", "Amadou", "Aliou", "Gorgui", "Youssouf", "Lassana"],
    family: ["Diop", "Ndiaye", "Fall", "Sow", "Diallo", "Traoré", "Coulibaly", "Keita", "Camara", "Konaté", "Sarr", "Ba", "Cissé", "Touré"],
  },
  central_africa_fr: {
    given: ["Pascal", "Serge", "Joël", "Christian", "Junior", "Landry", "Patrick", "Bismack", "Jean-Marc", "Hervé", "Didier", "Aimé", "Yannick", "Olivier"],
    family: ["Mbah", "Nkemelu", "Mutombo", "Kabongo", "Ilunga", "Mbala", "Ngoma", "Mouanda", "Nzeyimana", "Habimana", "Mugisha", "Kalala", "Mbenza", "Ndayishimiye"],
  },
  east_africa: {
    given: ["Brian", "Kevin", "Dennis", "Collins", "Ibrahim", "Baraka", "Juma", "Emmanuel", "Isaac", "Joseph", "Daniel", "Hassan", "Moses", "Peter"],
    family: ["Otieno", "Kamau", "Mwangi", "Wanjiru", "Mutua", "Ochieng", "Kiprop", "Mwakyusa", "Nyerere", "Okello", "Kato", "Mugisha", "Ssempala", "Odhiambo"],
  },
  horn: {
    given: ["Dawit", "Yonas", "Abel", "Henok", "Mohamed", "Abdi", "Ahmed", "Samuel", "Biniam", "Liban", "Bereket", "Yared", "Hamza", "Kidus"],
    family: ["Tesfaye", "Bekele", "Haile", "Girma", "Mohamed", "Hassan", "Abdi", "Tadesse", "Ali", "Gebre", "Warsame", "Mengistu", "Ahmed", "Mesfin"],
  },
  sudan: {
    given: ["Deng", "Majok", "Garang", "Ajang", "Akol", "Thon", "Wal", "Mohamed", "Omer", "Ahmed", "Kuol", "Makur", "Bol", "Mayen"],
    family: ["Deng", "Garang", "Bol", "Majok", "Akech", "Mayen", "Kuol", "Ajak", "Abdelrahman", "Osman", "Mabior", "Chol", "Ater", "Maker"],
  },
  southern_africa: {
    given: ["Thabo", "Sipho", "Lwazi", "Kagiso", "Tendai", "Tatenda", "Chanda", "Mulenga", "Lerato", "Bongani", "Kabelo", "Tapiwa", "Mpho", "Themba"],
    family: ["Dlamini", "Nkosi", "Ndlovu", "Mokoena", "Khumalo", "Moyo", "Banda", "Phiri", "Mwale", "Shikongo", "Sibanda", "Mahlangu", "Zulu", "Ncube"],
  },
  lusophone_africa: {
    given: ["Bruno", "Edson", "Yanick", "Carlos", "Childe", "Gerson", "Nelson", "Leonel", "Jaílson", "Hélder", "Mário", "Ivan", "Celso", "Adilson"],
    family: ["Fernandes", "da Silva", "Morais", "Tavares", "Cardoso", "Gomes", "Lopes", "Mendes", "Sanches", "Dias", "Costa", "Correia", "Monteiro", "Neto"],
  },
  mg: {
    given: ["Hery", "Tiana", "Fanilo", "Mamy", "Rado", "Andry", "Tojo", "Faniry", "Haja", "Lalaina", "Mahery", "Nirina", "Solofo", "Toky"],
    family: ["Rakoto", "Randrianarisoa", "Rasolofo", "Andriamanana", "Razafindrakoto", "Rabe", "Raharison", "Rajaonarison", "Ratsimba", "Andrianjafy", "Ravelo", "Rasoanaivo", "Ramanantsoa", "Rakotomalala"],
  },
  caribbean_en: {
    given: ["Andre", "Dwayne", "Kemar", "Jahmal", "Shamar", "Akeem", "Tyrese", "Romario", "Deandre", "Chad", "Kadeem", "Jerome", "Shane", "Marlon"],
    family: ["Campbell", "Brown", "Williams", "Thompson", "Francis", "Joseph", "Charles", "Edwards", "Morris", "Grant", "Gordon", "Clarke", "Bailey", "Roberts"],
  },
  haiti_fr_caribbean: {
    given: ["Jean", "Wesley", "Stanley", "Jeff", "Mackenson", "Ricardo", "Fabrice", "Kervens", "Loïc", "Steeve", "Dimitri", "Johan", "Mickaël", "Teddy"],
    family: ["Pierre", "Jean-Baptiste", "Joseph", "Louis", "Charles", "Desir", "Toussaint", "Saint-Fleur", "Hyppolite", "Rémy", "Lucien", "Maurice", "Gédéon", "Célestin"],
  },
  pacific: {
    given: ["Sione", "Tevita", "Losa", "Mose", "Ioane", "Ratu", "Josaia", "Tamati", "Viliami", "Manu", "Peni", "Kalani", "Junior", "Kiri"],
    family: ["Tuilagi", "Fifita", "Taufa", "Tuipulotu", "Leota", "Ravouvou", "Naivalu", "Faleolo", "Tupou", "Mahe", "Kioa", "Vainikolo", "Fonoti", "Tamale"],
  },
  greenland: {
    given: ["Malik", "Inuk", "Aputsiaq", "Nuka", "Hans", "Pele", "Kunuk", "Ole", "Nukappi", "Minik", "Lars", "Ivik", "Tobias", "Kaali"],
    family: ["Kleist", "Olsen", "Lynge", "Petersen", "Motzfeldt", "Kristiansen", "Berthelsen", "Rosing", "Egede", "Fleischer", "Heilmann", "Larsen", "Lennert", "Kuitse"],
  },
};

const BY_COUNTRY: Record<string, string> = {
  US: "us", PR: "caribbean_es", VI: "caribbean_en", GU: "pacific", AS: "pacific", MP: "pacific", UM: "us",
  GB: "anglo", IE: "anglo", IM: "anglo", JE: "anglo", GG: "anglo", GI: "anglo", FK: "anglo", SH: "anglo", PN: "pacific",
  AU: "aunz", NZ: "aunz", NF: "aunz", CX: "aunz", CC: "malay", CK: "pacific", NU: "pacific", TK: "pacific",
  CA: "ca",
  ES: "es", AD: "es",
  MX: "latam", AR: "latam", CL: "latam", CO: "latam", PE: "latam", VE: "latam", UY: "latam", PY: "latam", BO: "latam", EC: "latam",
  GT: "latam", HN: "latam", SV: "latam", NI: "latam", CR: "latam", PA: "latam",
  CU: "caribbean_es", DO: "caribbean_es",
  BR: "br", PT: "pt",
  FR: "fr", MC: "fr", LU: "fr", BL: "fr", MF: "fr", PM: "fr", RE: "fr", YT: "fr", NC: "fr", PF: "pacific", WF: "pacific",
  GP: "haiti_fr_caribbean", MQ: "haiti_fr_caribbean", GF: "haiti_fr_caribbean", HT: "haiti_fr_caribbean",
  IT: "it", SM: "it", VA: "it", MT: "it",
  DE: "de", AT: "de", CH: "de", LI: "de",
  NL: "nl", BE: "nl", AW: "caribbean_es", CW: "caribbean_es", BQ: "caribbean_es", SX: "caribbean_en", SR: "nl",
  SE: "nordic", NO: "nordic", DK: "nordic", IS: "nordic", FO: "nordic", SJ: "nordic", AX: "nordic", GL: "greenland",
  FI: "fi",
  LT: "lt", LV: "lv_ee", EE: "lv_ee",
  PL: "pl", CZ: "cz_sk", SK: "cz_sk", HU: "hu", RO: "ro", MD: "ro",
  RS: "balkan", HR: "balkan", BA: "balkan", ME: "balkan", SI: "balkan",
  BG: "bg_mk", MK: "bg_mk",
  GR: "gr", CY: "gr",
  TR: "tr_az", AZ: "tr_az",
  AL: "al_xk", XK: "al_xk",
  RU: "east_slavic", UA: "east_slavic", BY: "east_slavic",
  GE: "caucasus", AM: "caucasus",
  KZ: "central_asia", UZ: "central_asia", KG: "central_asia", TJ: "central_asia", TM: "central_asia",
  MN: "mn",
  CN: "cn", TW: "tw", HK: "hk", MO: "hk", SG: "cn",
  JP: "jp", KR: "kr", KP: "kr",
  PH: "ph",
  ID: "malay", MY: "malay", BN: "malay", TL: "lusophone_africa",
  VN: "vn", TH: "th", KH: "mainland_sea", LA: "mainland_sea", MM: "mainland_sea",
  IN: "south_asia", BT: "bd_np_lk", NP: "bd_np_lk", BD: "bd_np_lk", LK: "bd_np_lk", MV: "bd_np_lk",
  PK: "pk_af", AF: "pk_af",
  SA: "arab", AE: "arab", QA: "arab", KW: "arab", BH: "arab", OM: "arab", YE: "arab", IQ: "arab", SY: "arab", JO: "arab", LB: "arab", PS: "arab", EG: "arab", LY: "arab",
  MA: "maghreb", DZ: "maghreb", TN: "maghreb", EH: "maghreb", MR: "sahel_fr",
  IR: "ir", IL: "il",
  NG: "ng",
  GH: "west_africa_en", LR: "west_africa_en", SL: "west_africa_en", GM: "west_africa_en",
  SN: "sahel_fr", ML: "sahel_fr", BF: "sahel_fr", NE: "sahel_fr", GN: "sahel_fr", CI: "sahel_fr", TG: "sahel_fr", BJ: "sahel_fr", TD: "sahel_fr",
  CM: "central_africa_fr", CD: "central_africa_fr", CG: "central_africa_fr", GA: "central_africa_fr", CF: "central_africa_fr", GQ: "central_africa_fr",
  RW: "central_africa_fr", BI: "central_africa_fr", KM: "central_africa_fr", DJ: "horn", SC: "central_africa_fr", MU: "central_africa_fr",
  KE: "east_africa", TZ: "east_africa", UG: "east_africa",
  ET: "horn", ER: "horn", SO: "horn",
  SD: "sudan", SS: "sudan",
  ZA: "southern_africa", BW: "southern_africa", LS: "southern_africa", SZ: "southern_africa", ZW: "southern_africa", ZM: "southern_africa", MW: "southern_africa", NA: "southern_africa",
  AO: "lusophone_africa", MZ: "lusophone_africa", CV: "lusophone_africa", GW: "lusophone_africa", ST: "lusophone_africa",
  MG: "mg",
  JM: "caribbean_en", TT: "caribbean_en", BS: "caribbean_en", BB: "caribbean_en", AG: "caribbean_en", DM: "caribbean_en", GD: "caribbean_en", KN: "caribbean_en", LC: "caribbean_en",
  VC: "caribbean_en", BZ: "caribbean_en", GY: "caribbean_en", BM: "caribbean_en", KY: "caribbean_en", TC: "caribbean_en", VG: "caribbean_en", AI: "caribbean_en", MS: "caribbean_en",
  FJ: "pacific", WS: "pacific", TO: "pacific", PG: "pacific", SB: "pacific", VU: "pacific", KI: "pacific", TV: "pacific", NR: "pacific", FM: "pacific", MH: "pacific", PW: "pacific",
};

const REGION_FALLBACK: Record<string, string> = { africa: "west_africa_en", americas: "latam", asia: "arab", europe: "anglo", oceania: "pacific" };

export function poolFor(countryId: string): string {
  const id = BY_COUNTRY[countryId];
  if (id) return id;
  const c = country(countryId);
  return REGION_FALLBACK[c.region] ?? "anglo";
}

export function namePoolIds(): string[] {
  return Object.keys(POOLS);
}

export function mappedCountryIds(): string[] {
  return Object.keys(BY_COUNTRY);
}

export function drawName(rng: Rng, poolId: string) {
  const pool = POOLS[poolId] ?? POOLS.anglo!;
  const givenName = rng.pick(pool.given);
  const familyName = rng.pick(pool.family);
  return { givenName, familyName, displayName: formatName(givenName, familyName, poolId) };
}

export function formatName(given: string, family: string, poolId: string) {
  return POOLS[poolId]?.familyFirst ? `${family} ${given}` : `${given} ${family}`;
}

/** Name for a peer or a fictional draft prospect. */
export function peerName(rng: Rng, countryId: string) {
  return drawName(rng, poolFor(countryId)).displayName;
}

const TOWN_PARTS: Record<string, [string[], string[]]> = {
  default: [["North", "East", "West", "South", "New", "Old", "Upper", "Lower"], ["field", "bridge", "ford", "haven", "ton", "dale", "port", "brook"]],
  es: [["San ", "Villa", "Puerto ", "Santa ", "Valle ", "Río "], ["mar", "nueva", "alta", "verde", "real", "blanca", "seca", "del Sol"]],
  latam: [["San ", "Villa ", "Puerto ", "Santa ", "Nueva ", "Río "], ["Esperanza", "Rosario", "del Valle", "Alegre", "Grande", "Clara", "del Mar", "Hermosa"]],
  br: [["São ", "Vila ", "Porto ", "Santa ", "Nova ", "Rio "], ["Paulo", "Esperança", "Alegre", "Clara", "Verde", "do Sul", "Bonito", "Formosa"]],
  fr: [["Saint-", "Mont", "Ville", "Beau", "Fontaine-", "Port-"], ["lac", "rive", "mont", "champ", "val", "pré", "bois", "sur-Mer"]],
  de: [["Ober", "Unter", "Neu", "Alt", "Bad ", "Hoch"], ["berg", "dorf", "feld", "hausen", "bach", "burg", "heim", "stadt"]],
};

const TOWN_KEY: Record<string, string> = { es: "es", latam: "latam", caribbean_es: "latam", br: "br", pt: "br", fr: "fr", de: "de", us: "default", anglo: "default", aunz: "default", ca: "default" };

/**
 * A fictional hometown name for cultures where the generator reads naturally.
 * Returns null elsewhere so the UI says "a small town" instead of inventing.
 * Always consumes two draws so the stream stays aligned across pools.
 */
export function townName(rng: Rng, poolId: string): string | null {
  const key = TOWN_KEY[poolId];
  const [a, b] = TOWN_PARTS[key ?? "default"]!;
  const name = `${rng.pick(a)}${rng.pick(b)}`;
  return key ? name : null;
}
