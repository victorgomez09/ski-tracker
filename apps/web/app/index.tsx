import { Redirect } from 'expo-router';

import '../styles/global.css';

export default function Index() {
    return Redirect({ href: "/resorts" });
}