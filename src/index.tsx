/** @jsx DayiJS.createElement */
import DayiJS from "./dayi-dom";

type PropTypes = {
  name?: string;
};

const DayiComp = (props: PropTypes) => {
  return <h1>DayiJS written by: {props?.name}</h1>;
};

const App = (props: PropTypes) => <DayiComp name="The Dayı" />;
const container = document.getElementById("root") as HTMLElement;

DayiJS.render(<App />, container);
