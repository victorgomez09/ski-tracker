import { SubmitHandler, useForm } from "react-hook-form";
import * as SecureStore from 'expo-secure-store';
import { useRouter } from "expo-router";
import { Platform } from "react-native";

import { API_BASE_URL } from "constants/constants";
import { useAuth } from "context/auth.context";

interface Login {
    email: string;
    password: string;
}

interface LoginResponse {
    access_token: string;
    refresh_token: string;
}

export default function LoginView() {
    const router = useRouter();
    const {signIn} = useAuth();
    
    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<Login>({ mode: "onTouched" })

    const onSubmit: SubmitHandler<Login> = async (data) => {
        const request = await fetch(`${API_BASE_URL}/auth/login`, {
            body: JSON.stringify(data),
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            }
        })

        if (request.ok) {
            const data = await request.json() as LoginResponse;
            
            signIn(data.access_token);
            router.push("/private");
        } else {
            console.error("Login failed:", request.status, request.statusText);
        }
    }

    return (
        <div className="hero bg-base-200 min-h-screen">
            <div className="hero-content flex-col lg:flex-row-reverse">
                <div className="card bg-base-100 w-80 shrink-0 shadow-md">
                    <div className="card-body">
                        <h1 className="card-title">Login</h1>

                        <form onSubmit={handleSubmit(onSubmit)}>
                            <fieldset className="fieldset">
                                {/* EMAIL */}
                                <label className="label">Email</label>
                                <input type="email" className={`input input-bordered ${errors.email ? "input-error" : ""}`} placeholder="Email" {...register("email", {
                                    required: true,
                                    pattern: /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/
                                })} />
                                {errors.email?.type === "required" && <p className="label italic text-error">Email is required</p>}
                                {errors.email?.type === "pattern" && <p className="label italic text-error">Invalid email address</p>}

                                {/* PASSWORD */}
                                <label className="label">Password</label>
                                <input type="password" className={`input input-bordered ${errors.password ? "input-error" : ""}`} placeholder="Password" {...register("password", {
                                    required: true,
                                })} />
                                {errors.password?.type === "required" && <p className="label italic text-error">Password is required</p>}

                                {/* SUBMIT */}
                                <button className="btn btn-neutral mt-4" type="submit" disabled={Object.keys(errors).length > 0}>Login</button>

                                <a href="/register" className="link link-secondary text-center">If you don't have an account, register here!</a>
                            </fieldset>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    )
}