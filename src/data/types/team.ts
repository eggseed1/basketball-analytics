export interface Team {
  id: string;
  abbreviation: string;
  fullName: string;
  city: string;
  nickname: string;
  conference: "East" | "West";
  division: string;
}
