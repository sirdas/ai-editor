const colors = [
	"#958DF1",
	"#F98181",
	"#FBBC88",
	"#FAF594",
	"#70CFF8",
	"#94FADB",
	"#B9F18D",
];

const names = [
	"Lea Thompson",
	"Cyndi Lauper",
	"Tom Cruise",
	"Madonna",
	"Jerry Hall",
	"Joan Collins",
	"Winona Ryder",
	"Christina Applegate",
	"Alyssa Milano",
	"Molly Ringwald",
	"Ally Sheedy",
	"Debbie Harry",
	"Olivia Newton-John",
	"Elton John",
	"Michael J. Fox",
	"Axl Rose",
	"Emilio Estevez",
	"Ralph Macchio",
	"Rob Lowe",
	"Jennifer Grey",
	"Mickey Rourke",
	"John Cusack",
	"Matthew Broderick",
	"Justine Bateman",
	"Lisa Bonet",
];

const getRandomElement = (list: string[]) =>
	list[Math.floor(Math.random() * list.length)];

export const getRandomColor = () => getRandomElement(colors);
export const getRandomName = () => getRandomElement(names);

export const getInitialUserId = () => {
	if (typeof window === "undefined") return null;
	return localStorage.getItem("userId");
};
